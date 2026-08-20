"""
Automated coverage for the parts of Phase 2c that are easy to eyeball-pass
once and silently regress: sequential registration numbering, per-role
visibility scoping, and tier-snapshot immutability. This supplements (does
not replace) the manual live-docker-compose walkthrough described in the
Phase 2c plan.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django_tenants.test.cases import TenantTestCase

from orgstructure.models import Department, Division, SubDivision, TenantWorkflowConfig

from .models import Correspondence, RoutingEvent, next_registration_number

User = get_user_model()


class RegistrationNumberTests(TenantTestCase):
    def test_sequential_numbers_are_unique_and_increment(self):
        numbers = [next_registration_number() for _ in range(5)]
        self.assertEqual(len(numbers), len(set(numbers)), "registration numbers must be unique")

        suffixes = [int(n.split("/")[1]) for n in numbers]
        self.assertEqual(suffixes, sorted(suffixes), "numbers must increment in call order")
        self.assertEqual(suffixes[-1] - suffixes[0], 4)


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
