"""
Automated coverage for the parts of Phase 2c that are easy to eyeball-pass
once and silently regress: sequential registration numbering, per-role
visibility scoping, and tier-snapshot immutability. This supplements (does
not replace) the manual live-docker-compose walkthrough described in the
Phase 2c plan.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import models
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase

from orgstructure.models import Department, Division, SubDivision, TenantWorkflowConfig

from .forms import AttachmentUploadForm, CorrespondenceRegisterForm
from .models import (
    Correspondence,
    CorrespondenceAttachment,
    OutgoingCorrespondence,
    RegistrationCounter,
    RoutingEvent,
    attachment_upload_path,
    next_registration_number,
)
from .notifications import notify_new_holder, notify_registrant_closed
from .views import _can_reply, _can_send_outgoing, _parse_bulk_csv, _reports_data

User = get_user_model()


def _csv_file(text):
    return SimpleUploadedFile("bulk.csv", text.encode("utf-8"), content_type="text/csv")


class RegistrationNumberTests(TenantTestCase):
    def test_sequential_numbers_are_unique_and_increment(self):
        numbers = [next_registration_number() for _ in range(5)]
        self.assertEqual(len(numbers), len(set(numbers)), "registration numbers must be unique")

        suffixes = [int(n.split("/")[1]) for n in numbers]
        self.assertEqual(suffixes, sorted(suffixes), "numbers must increment in call order")
        self.assertEqual(suffixes[-1] - suffixes[0], 4)


class NotificationTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.registrant = User.objects.create_user("postal", password="x", email="postal@example.org")
        self.officer = User.objects.create_user("officer", password="x", email="officer@example.org")
        self.letter = Correspondence.objects.create(
            registration_number="2026/00001",
            subject="Test letter",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept,
            registered_by=self.registrant,
        )

    def test_notify_new_holder_sends_email(self):
        notify_new_holder(self.letter, self.officer)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.officer.email, mail.outbox[0].to)
        self.assertIn("2026/00001", mail.outbox[0].subject)

    def test_notify_registrant_closed_sends_email(self):
        notify_registrant_closed(self.letter)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.registrant.email, mail.outbox[0].to)

    def test_recipient_with_no_email_is_skipped_silently(self):
        no_email_user = User.objects.create_user("noemail", password="x")
        notify_new_holder(self.letter, no_email_user)
        self.assertEqual(len(mail.outbox), 0)


class ReportsTests(TenantTestCase):
    def setUp(self):
        self.dept_a = Department.objects.create(name="Land Administration")
        self.dept_b = Department.objects.create(name="Finance")
        g_postal = Group.objects.create(name="Postal Officer")
        self.postal = User.objects.create_user("postal", password="x")
        self.postal.groups.add(g_postal)

        g_hob = Group.objects.create(name="Head of Branch")
        self.hob_a = User.objects.create_user("hob_a", password="x", department=self.dept_a)
        self.hob_a.groups.add(g_hob)

        Correspondence.objects.create(
            registration_number="2026/00001", subject="A", sender_name="X",
            date_received="2026-01-01", department=self.dept_a, registered_by=self.postal,
            status=Correspondence.Status.NEW,
        )
        Correspondence.objects.create(
            registration_number="2026/00002", subject="B", sender_name="X",
            date_received="2026-01-01", department=self.dept_a, registered_by=self.postal,
            status=Correspondence.Status.ASSIGNED, due_date="2020-01-01",  # overdue
        )
        closed = Correspondence.objects.create(
            registration_number="2026/00003", subject="C", sender_name="X",
            date_received="2026-01-01", department=self.dept_a, registered_by=self.postal,
            status=Correspondence.Status.CLOSED,
        )
        # .update() bypasses auto_now/auto_now_add (those only apply in
        # Model.save()), letting us pin an exact turnaround duration.
        now = timezone.now()
        Correspondence.objects.filter(pk=closed.pk).update(
            created_at=now - timedelta(days=2), updated_at=now
        )

        # In a different department — should be invisible to hob_a.
        Correspondence.objects.create(
            registration_number="2026/00004", subject="D", sender_name="X",
            date_received="2026-01-01", department=self.dept_b, registered_by=self.postal,
            status=Correspondence.Status.NEW,
        )

    def test_totals_and_status_breakdown(self):
        data = _reports_data(self.postal)  # Postal Officer sees everything they registered
        self.assertEqual(data["total_count"], 4)
        counts = {row["label"]: row["count"] for row in data["status_counts"]}
        self.assertEqual(counts.get("New"), 2)
        self.assertEqual(counts.get("Assigned"), 1)
        self.assertEqual(counts.get("Closed"), 1)

    def test_overdue_count(self):
        data = _reports_data(self.postal)
        self.assertEqual(data["overdue_count"], 1)

    def test_average_turnaround_for_closed_letters(self):
        data = _reports_data(self.postal)
        self.assertIsNotNone(data["avg_turnaround"])
        self.assertAlmostEqual(
            data["avg_turnaround"].total_seconds(), timedelta(days=2).total_seconds(), delta=5
        )

    def test_scoped_to_visible_letters_only(self):
        data = _reports_data(self.hob_a)
        self.assertEqual(data["total_count"], 3, "hob_a must not see dept_b's letter in the totals")
        departments = {row["label"] for row in data["department_counts"]}
        self.assertEqual(departments, {"Land Administration"})


class AttachmentTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.postal = User.objects.create_user("postal", password="x")
        self.letter = Correspondence.objects.create(
            registration_number="2026/00001",
            subject="Test letter",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept,
            registered_by=self.postal,
        )

    def test_upload_path_is_scoped_by_tenant_schema_and_letter(self):
        from django.db import connection

        attachment = CorrespondenceAttachment(correspondence=self.letter)
        path = attachment_upload_path(attachment, "report.pdf")
        self.assertIn(f"correspondence/{connection.schema_name}/{self.letter.pk}/", path)
        self.assertTrue(path.endswith("report.pdf"))

    def test_form_rejects_disallowed_extension(self):
        f = SimpleUploadedFile("virus.exe", b"data", content_type="application/octet-stream")
        form = AttachmentUploadForm(files={"file": f})
        self.assertFalse(form.is_valid())
        self.assertIn("file", form.errors)

    def test_form_accepts_allowed_extension(self):
        f = SimpleUploadedFile("report.pdf", b"%PDF-1.4 fake", content_type="application/pdf")
        form = AttachmentUploadForm(files={"file": f})
        self.assertTrue(form.is_valid())

    def test_form_rejects_oversized_file(self):
        big_content = b"x" * (16 * 1024 * 1024)  # 16MB, over the 15MB limit
        f = SimpleUploadedFile("big.pdf", big_content, content_type="application/pdf")
        form = AttachmentUploadForm(files={"file": f})
        self.assertFalse(form.is_valid())


class ReceivedViaFieldTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")

    def _base_data(self, **overrides):
        data = {
            "subject": "Test letter",
            "sender_name": "Someone",
            "sender_address": "",
            "date_received": "2026-01-01",
            "remarks": "",
            "department": str(self.dept.pk),
            "due_date": "",
        }
        data.update(overrides)
        return data

    def test_predefined_option_is_used_directly(self):
        form = CorrespondenceRegisterForm(data=self._base_data(received_via="Email"))
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["received_via"], "Email")

    def test_other_without_text_is_rejected(self):
        form = CorrespondenceRegisterForm(
            data=self._base_data(received_via="Other", received_via_other="")
        )
        self.assertFalse(form.is_valid())
        self.assertIn("received_via_other", form.errors)

    def test_other_with_text_overrides_the_choice_value(self):
        form = CorrespondenceRegisterForm(
            data=self._base_data(received_via="Other", received_via_other="Courier (DHL)")
        )
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["received_via"], "Courier (DHL)")

    def test_blank_received_via_is_allowed(self):
        form = CorrespondenceRegisterForm(data=self._base_data(received_via=""))
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["received_via"], "")


class BulkRegisterCsvTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration", short_code="LA")

    def test_valid_rows_parse_cleanly(self):
        csv_text = (
            "subject,sender_name,sender_address,date_received,received_via,remarks,department,due_date\n"
            "Test letter,A. Perera,123 Main St,2026-08-15,Post,,Land Administration,\n"
            "Another letter,N. Silva,,2026-08-16,Email,note,LA,2026-09-01\n"
        )
        rows, errors = _parse_bulk_csv(_csv_file(csv_text))
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["department"], self.dept)
        self.assertEqual(rows[1]["department"], self.dept, "should match by short_code too")
        self.assertEqual(rows[1]["due_date"].isoformat(), "2026-09-01")

    def test_missing_required_column_is_rejected(self):
        csv_text = "subject,sender_name,date_received\nX,Y,2026-08-15\n"
        rows, errors = _parse_bulk_csv(_csv_file(csv_text))
        self.assertEqual(rows, [])
        self.assertTrue(any("department" in e for e in errors))

    def test_unknown_department_reported_per_row(self):
        csv_text = (
            "subject,sender_name,date_received,department\n"
            "X,Y,2026-08-15,Nonexistent Department\n"
        )
        rows, errors = _parse_bulk_csv(_csv_file(csv_text))
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("Row 2", errors[0])
        self.assertIn("Nonexistent Department", errors[0])

    def test_invalid_date_reported_per_row(self):
        csv_text = (
            "subject,sender_name,date_received,department\n"
            "X,Y,not-a-date,Land Administration\n"
        )
        rows, errors = _parse_bulk_csv(_csv_file(csv_text))
        self.assertEqual(rows, [])
        self.assertIn("date_received", errors[0])

    def test_one_bad_row_among_good_rows_reports_only_the_bad_one(self):
        # _parse_bulk_csv itself returns whatever parsed cleanly alongside
        # per-row errors; correspondence_bulk_register is what enforces
        # all-or-nothing by only calling .create() when errors is empty.
        csv_text = (
            "subject,sender_name,date_received,department\n"
            "Good one,A,2026-08-15,Land Administration\n"
            "Bad one,B,2026-08-16,Nowhere\n"
        )
        rows, errors = _parse_bulk_csv(_csv_file(csv_text))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["subject"], "Good one")
        self.assertEqual(len(errors), 1)
        self.assertIn("Row 3", errors[0])


class SearchTests(TenantTestCase):
    """
    correspondence_list's `q` param filters on registration_number, subject,
    and sender_name (icontains). This tests the filtering logic directly at
    the queryset level, matching how the view builds it.
    """

    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.postal = User.objects.create_user("postal", password="x")

        self.letter_a = Correspondence.objects.create(
            registration_number="2026/00001",
            subject="Land title dispute",
            sender_name="A. Perera",
            date_received="2026-01-01",
            department=self.dept,
            registered_by=self.postal,
        )
        self.letter_b = Correspondence.objects.create(
            registration_number="2026/00002",
            subject="Boundary survey request",
            sender_name="N. Silva",
            date_received="2026-01-02",
            department=self.dept,
            registered_by=self.postal,
        )

    def _search(self, query):
        return Correspondence.objects.filter(
            models.Q(registration_number__icontains=query)
            | models.Q(subject__icontains=query)
            | models.Q(sender_name__icontains=query)
        )

    def test_search_by_registration_number(self):
        self.assertEqual(set(self._search("00001")), {self.letter_a})

    def test_search_by_subject(self):
        self.assertEqual(set(self._search("boundary")), {self.letter_b})

    def test_search_by_sender_name_case_insensitive(self):
        self.assertEqual(set(self._search("perera")), {self.letter_a})

    def test_search_no_match(self):
        self.assertEqual(set(self._search("nonexistent")), set())


class VisibilityTests(TenantTestCase):
    def setUp(self):
        self.dept_a = Department.objects.create(name="Land Administration")
        self.dept_b = Department.objects.create(name="Finance")
        self.division_a = Division.objects.create(department=self.dept_a, name="Survey Division")
        self.sub_division_a = SubDivision.objects.create(division=self.division_a, name="GIS Sub-Branch")

        self.g_postal = Group.objects.create(name="Postal Officer")
        self.g_hob = Group.objects.create(name="Head of Branch")
        self.g_sbo = Group.objects.create(name="Sub-Branch Officer")
        self.g_so = Group.objects.create(name="Subject Officer")
        self.g_viewer = Group.objects.create(name="Viewer")

        self.postal = User.objects.create_user("postal", password="x")
        self.postal.groups.add(self.g_postal)

        self.hob_a = User.objects.create_user("hob_a", password="x", department=self.dept_a)
        self.hob_a.groups.add(self.g_hob)

        self.hob_b = User.objects.create_user("hob_b", password="x", department=self.dept_b)
        self.hob_b.groups.add(self.g_hob)

        self.sbo = User.objects.create_user("sbo", password="x", sub_division=self.sub_division_a)
        self.sbo.groups.add(self.g_sbo)

        self.subject_officer = User.objects.create_user("so", password="x")
        self.subject_officer.groups.add(self.g_so)

        self.viewer_a = User.objects.create_user("viewer_a", password="x", department=self.dept_a)
        self.viewer_a.groups.add(self.g_viewer)

        # A NEW letter registered by `postal`, targeting dept_a.
        self.letter_new = Correspondence.objects.create(
            registration_number="2026/00001",
            subject="Test letter",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept_a,
            registered_by=self.postal,
        )
        # A letter forwarded down to the sub-division (visible to sbo).
        self.letter_at_subdivision = Correspondence.objects.create(
            registration_number="2026/00002",
            subject="Test letter 2",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept_a,
            division=self.division_a,
            sub_division=self.sub_division_a,
            status=Correspondence.Status.ASSIGNED,
            registered_by=self.postal,
        )
        # A letter held by the named Subject Officer.
        self.letter_held = Correspondence.objects.create(
            registration_number="2026/00003",
            subject="Test letter 3",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept_a,
            current_holder=self.subject_officer,
            status=Correspondence.Status.ASSIGNED,
            registered_by=self.postal,
        )

    def test_postal_officer_sees_only_what_they_registered(self):
        visible = set(Correspondence.objects.visible_to(self.postal).values_list("pk", flat=True))
        self.assertEqual(
            visible,
            {self.letter_new.pk, self.letter_at_subdivision.pk, self.letter_held.pk},
        )

    def test_head_of_branch_sees_only_their_department(self):
        visible_a = set(Correspondence.objects.visible_to(self.hob_a).values_list("pk", flat=True))
        self.assertEqual(
            visible_a,
            {self.letter_new.pk, self.letter_at_subdivision.pk, self.letter_held.pk},
        )
        visible_b = set(Correspondence.objects.visible_to(self.hob_b).values_list("pk", flat=True))
        self.assertEqual(visible_b, set(), "Head of Branch in a different department must see nothing")

    def test_sub_branch_officer_sees_only_their_sub_division(self):
        visible = set(Correspondence.objects.visible_to(self.sbo).values_list("pk", flat=True))
        self.assertEqual(
            visible,
            {self.letter_at_subdivision.pk},
            "Sub-Branch Officer must only see letters routed into their own sub-division",
        )

    def test_subject_officer_sees_only_letters_they_hold(self):
        visible = set(
            Correspondence.objects.visible_to(self.subject_officer).values_list("pk", flat=True)
        )
        self.assertEqual(visible, {self.letter_held.pk})

    def test_viewer_scoped_to_department(self):
        visible = set(Correspondence.objects.visible_to(self.viewer_a).values_list("pk", flat=True))
        self.assertEqual(
            visible,
            {self.letter_new.pk, self.letter_at_subdivision.pk, self.letter_held.pk},
        )

    def test_user_with_no_matching_group_sees_nothing(self):
        bystander = User.objects.create_user("bystander", password="x")
        visible = set(Correspondence.objects.visible_to(bystander).values_list("pk", flat=True))
        self.assertEqual(visible, set())


class TierSnapshotTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.postal = User.objects.create_user("postal", password="x")
        self.hob = User.objects.create_user("hob", password="x", department=self.dept)

        self.letter = Correspondence.objects.create(
            registration_number="2026/00001",
            subject="Test letter",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept,
            registered_by=self.postal,
        )

    def test_snapshot_survives_later_config_changes(self):
        config = TenantWorkflowConfig.get_solo()
        config.sub_branch_tier_enabled = True
        config.save()

        event = RoutingEvent.objects.create(
            correspondence=self.letter,
            actor=self.hob,
            action=RoutingEvent.Action.FORWARD,
            sub_branch_tier_enabled_snapshot=config.sub_branch_tier_enabled,
        )
        self.assertTrue(event.sub_branch_tier_enabled_snapshot)

        # Flip the live config after the fact.
        config.sub_branch_tier_enabled = False
        config.save()

        event.refresh_from_db()
        self.assertTrue(
            event.sub_branch_tier_enabled_snapshot,
            "a routing event's tier snapshot must not change when the live config changes later",
        )


class ReassignmentTests(TenantTestCase):
    """
    Reassignment moves a letter laterally within its current tier (a
    different department/sub-division/officer) without changing status,
    as opposed to forward's advance-to-the-next-tier. See
    correspondence.views._can_reassign.
    """

    def setUp(self):
        self.dept_a = Department.objects.create(name="Land Administration")
        self.dept_b = Department.objects.create(name="Finance")
        self.division_a = Division.objects.create(department=self.dept_a, name="Survey Division")
        self.sub_division_a1 = SubDivision.objects.create(division=self.division_a, name="GIS Sub-Branch")
        self.sub_division_a2 = SubDivision.objects.create(division=self.division_a, name="Cadastral Sub-Branch")

        g_hob = Group.objects.create(name="Head of Branch")
        g_sbo = Group.objects.create(name="Sub-Branch Officer")
        g_so = Group.objects.create(name="Subject Officer")

        self.postal = User.objects.create_user("postal", password="x")
        self.hob = User.objects.create_user("hob", password="x", department=self.dept_a)
        self.hob.groups.add(g_hob)
        self.sbo = User.objects.create_user("sbo", password="x", sub_division=self.sub_division_a1)
        self.sbo.groups.add(g_sbo)
        self.so_a = User.objects.create_user("so_a", password="x", sub_division=self.sub_division_a1)
        self.so_a.groups.add(g_so)
        self.so_b = User.objects.create_user("so_b", password="x", sub_division=self.sub_division_a1)
        self.so_b.groups.add(g_so)

    def _letter(self, **kwargs):
        defaults = dict(
            registration_number=f"2026/{Correspondence.objects.count() + 1:05d}",
            subject="Test letter",
            sender_name="Someone",
            date_received="2026-01-01",
            department=self.dept_a,
            registered_by=self.postal,
        )
        defaults.update(kwargs)
        return Correspondence.objects.create(**defaults)

    def test_head_of_branch_reassigns_department(self):
        from .views import _can_reassign

        letter = self._letter()
        self.assertTrue(_can_reassign(self.hob, letter))
        letter.department = self.dept_b
        letter.save(update_fields=["department"])
        RoutingEvent.objects.create(
            correspondence=letter, actor=self.hob,
            action=RoutingEvent.Action.REASSIGN, to_department=self.dept_b,
        )
        letter.refresh_from_db()
        self.assertEqual(letter.department_id, self.dept_b.id)
        self.assertEqual(letter.status, Correspondence.Status.NEW, "reassignment must not change status")

    def test_sub_branch_officer_reassigns_sub_division(self):
        from .views import _can_reassign

        letter = self._letter(
            division=self.division_a,
            sub_division=self.sub_division_a1,
            status=Correspondence.Status.ASSIGNED,
        )
        self.assertTrue(_can_reassign(self.sbo, letter))
        letter.sub_division = self.sub_division_a2
        letter.save(update_fields=["sub_division"])
        self.assertEqual(letter.sub_division_id, self.sub_division_a2.id)
        self.assertEqual(letter.status, Correspondence.Status.ASSIGNED)

    def test_subject_officer_reassigns_to_peer(self):
        from .views import _can_reassign

        letter = self._letter(current_holder=self.so_a, status=Correspondence.Status.PENDING)
        self.assertTrue(_can_reassign(self.so_a, letter))
        self.assertFalse(_can_reassign(self.so_b, letter), "only the current holder may reassign")
        letter.current_holder = self.so_b
        letter.save(update_fields=["current_holder"])
        self.assertEqual(letter.current_holder_id, self.so_b.id)
        self.assertEqual(letter.status, Correspondence.Status.PENDING)

    def test_closed_letter_cannot_be_reassigned(self):
        from .views import _can_reassign

        letter = self._letter(current_holder=self.so_a, status=Correspondence.Status.CLOSED)
        self.assertFalse(_can_reassign(self.so_a, letter))
        self.assertFalse(_can_reassign(self.hob, letter))

    def test_head_of_branch_cannot_reassign_after_forwarding(self):
        from .views import _can_reassign

        letter = self._letter(
            division=self.division_a,
            sub_division=self.sub_division_a1,
            status=Correspondence.Status.ASSIGNED,
        )
        self.assertFalse(
            _can_reassign(self.hob, letter),
            "once routed to a sub-division, the department-level Head of Branch stage has passed",
        )


class OutgoingNumberingTests(TenantTestCase):
    def test_incoming_and_outgoing_sequences_are_independent(self):
        in1 = next_registration_number()
        out1 = next_registration_number(kind=RegistrationCounter.Kind.OUTGOING)
        in2 = next_registration_number()
        out2 = next_registration_number(kind=RegistrationCounter.Kind.OUTGOING)

        self.assertFalse(in1.startswith("OUT/"))
        self.assertTrue(out1.startswith("OUT/"))
        self.assertTrue(out2.startswith("OUT/"))

        in_seq = [int(n.split("/")[1]) for n in (in1, in2)]
        out_seq = [int(n.split("/")[2]) for n in (out1, out2)]
        self.assertEqual(in_seq, [1, 2])
        self.assertEqual(
            out_seq, [1, 2], "outgoing sequence must not skip or collide because of interleaved incoming calls"
        )


class OutgoingVisibilityTests(TenantTestCase):
    def setUp(self):
        self.dept_a = Department.objects.create(name="Land Administration")
        self.dept_b = Department.objects.create(name="Finance")
        g_hob = Group.objects.create(name="Head of Branch")

        self.drafter = User.objects.create_user("drafter", password="x")
        self.hob_a = User.objects.create_user("hob_a", password="x", department=self.dept_a)
        self.hob_a.groups.add(g_hob)
        self.hob_b = User.objects.create_user("hob_b", password="x", department=self.dept_b)
        self.hob_b.groups.add(g_hob)
        self.bystander = User.objects.create_user("bystander", password="x")

        self.draft = OutgoingCorrespondence.objects.create(
            reference_number="OUT/2026/00001",
            subject="Test reply",
            recipient_name="Someone",
            department=self.dept_a,
            drafted_by=self.drafter,
        )

    def test_drafter_sees_own_draft(self):
        visible = set(OutgoingCorrespondence.objects.visible_to(self.drafter).values_list("pk", flat=True))
        self.assertEqual(visible, {self.draft.pk})

    def test_head_of_branch_sees_department_drafts_they_did_not_write(self):
        visible = set(OutgoingCorrespondence.objects.visible_to(self.hob_a).values_list("pk", flat=True))
        self.assertEqual(visible, {self.draft.pk})

    def test_head_of_branch_in_different_department_sees_nothing(self):
        visible = set(OutgoingCorrespondence.objects.visible_to(self.hob_b).values_list("pk", flat=True))
        self.assertEqual(visible, set())

    def test_unrelated_user_sees_nothing(self):
        visible = set(OutgoingCorrespondence.objects.visible_to(self.bystander).values_list("pk", flat=True))
        self.assertEqual(visible, set())


class CanReplyTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.postal = User.objects.create_user("postal", password="x")
        self.holder = User.objects.create_user("holder", password="x")
        self.other = User.objects.create_user("other", password="x")

    def _letter(self, **kwargs):
        defaults = dict(
            registration_number="2026/00001",
            subject="Test",
            sender_name="X",
            date_received="2026-01-01",
            department=self.dept,
            registered_by=self.postal,
            current_holder=self.holder,
        )
        defaults.update(kwargs)
        return Correspondence.objects.create(**defaults)

    def test_current_holder_can_reply_while_open(self):
        letter = self._letter(status=Correspondence.Status.ASSIGNED)
        self.assertTrue(_can_reply(self.holder, letter))

    def test_current_holder_can_still_reply_after_closed(self):
        # Confirmed product decision: replying doesn't mutate the inbound
        # letter's own state, so closing must not block a follow-up reply
        # the way it blocks forward/reassign/mark-pending/close. This is
        # the one test that would catch an accidental regression back to
        # mirroring _can_act_as_holder's CLOSED guard.
        letter = self._letter(status=Correspondence.Status.CLOSED)
        self.assertTrue(_can_reply(self.holder, letter))

    def test_non_holder_cannot_reply(self):
        letter = self._letter(status=Correspondence.Status.ASSIGNED)
        self.assertFalse(_can_reply(self.other, letter))

    def test_superuser_can_always_reply(self):
        letter = self._letter(status=Correspondence.Status.CLOSED)
        superuser = User.objects.create_superuser("admin", password="x")
        self.assertTrue(_can_reply(superuser, letter))


class OutgoingSendTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        self.drafter = User.objects.create_user("drafter", password="x")
        self.other = User.objects.create_user("other", password="x")
        self.draft = OutgoingCorrespondence.objects.create(
            reference_number="OUT/2026/00001",
            subject="Test",
            recipient_name="Someone",
            department=self.dept,
            drafted_by=self.drafter,
        )

    def test_drafter_can_send(self):
        self.assertTrue(_can_send_outgoing(self.drafter, self.draft))

    def test_other_user_cannot_send(self):
        self.assertFalse(_can_send_outgoing(self.other, self.draft))

    def test_superuser_can_send(self):
        superuser = User.objects.create_superuser("admin", password="x")
        self.assertTrue(_can_send_outgoing(superuser, self.draft))

    def test_already_sent_cannot_be_sent_again(self):
        self.draft.status = OutgoingCorrespondence.Status.SENT
        self.draft.save(update_fields=["status"])
        self.assertFalse(_can_send_outgoing(self.drafter, self.draft))
        self.assertFalse(_can_send_outgoing(User.objects.create_superuser("admin", password="x"), self.draft))


class OutgoingReportsTests(TenantTestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Land Administration")
        g_postal = Group.objects.create(name="Postal Officer")
        self.postal = User.objects.create_user("postal", password="x")
        self.postal.groups.add(g_postal)

        OutgoingCorrespondence.objects.create(
            reference_number="OUT/2026/00001",
            subject="A",
            recipient_name="X",
            department=self.dept,
            drafted_by=self.postal,
            status=OutgoingCorrespondence.Status.DRAFT,
        )
        OutgoingCorrespondence.objects.create(
            reference_number="OUT/2026/00002",
            subject="B",
            recipient_name="X",
            department=self.dept,
            drafted_by=self.postal,
            status=OutgoingCorrespondence.Status.SENT,
        )

    def test_outgoing_counts_appear_in_reports_data(self):
        data = _reports_data(self.postal)
        self.assertEqual(data["outgoing_total_count"], 2)
        counts = {row["label"]: row["count"] for row in data["outgoing_status_counts"]}
        self.assertEqual(counts.get("Draft"), 1)
        self.assertEqual(counts.get("Sent"), 1)
