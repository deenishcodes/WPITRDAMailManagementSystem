"""
Correspondence (incoming letter) tracking — Phase 2c.

Routes a registered letter through Postal Officer -> Head of Branch ->
(Sub-Branch Officer, if TenantWorkflowConfig.sub_branch_tier_enabled was on
when it reached that step) -> Subject Officer -> Closed. No formal spec
document exists for this workflow; the model below is inferred from the
already-seeded role names (see orgstructure.management.commands.seed_roles)
and the Department -> Division -> SubDivision hierarchy.

Lives in TENANT_APPS (see settings.py), so every organisation's
correspondence is isolated per-schema like everything else in this project.
"""

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class RegistrationCounter(models.Model):
    """
    One row per (calendar year, kind), used to hand out sequential,
    human-readable registration numbers ("2026/00001" for incoming,
    "OUT/2026/00001" for outgoing) safely under concurrent registration.
    Incoming and outgoing draw from independent sequences so neither
    collides with or skips because of the other.

    A plain model (locked with select_for_update, see
    next_registration_number below) rather than a raw Postgres SEQUENCE,
    because schema-per-tenant means every tenant needs its own
    independently-numbered, year-resetting sequence — a plain model migrates
    into every tenant schema automatically the same way everything else in
    this project already does; a hand-managed per-tenant-per-year SEQUENCE
    would not.
    """

    class Kind(models.TextChoices):
        INCOMING = "in", "Incoming"
        OUTGOING = "out", "Outgoing"

    year = models.PositiveIntegerField()
    kind = models.CharField(max_length=3, choices=Kind.choices, default=Kind.INCOMING)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["year", "kind"], name="unique_registration_counter_year_kind")
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.year} (last: {self.last_number})"


def next_registration_number(kind=RegistrationCounter.Kind.INCOMING):
    """
    Allocates the next sequential registration number for the current year
    and the given kind (incoming letters vs. outgoing correspondence).

    Must be called inside the same transaction.atomic() block as the
    Correspondence.objects.create(...) / OutgoingCorrespondence.objects.
    create(...) it's for, so the counter increment and the new row commit or
    roll back together. Deliberately not a save()/pre_save hook — that would
    silently allocate a new number on any unrelated save of an instance
    missing one.
    """
    year = timezone.localdate().year
    with transaction.atomic():
        counter, _ = RegistrationCounter.objects.select_for_update().get_or_create(
            year=year, kind=kind, defaults={"last_number": 0}
        )
        counter.last_number += 1
        counter.save(update_fields=["last_number"])
        if kind == RegistrationCounter.Kind.OUTGOING:
            return f"OUT/{year}/{counter.last_number:05d}"
        return f"{year}/{counter.last_number:05d}"


class CorrespondenceQuerySet(models.QuerySet):
    def visible_to(self, user):
        """
        Department/division/sub-division/holder-scoped visibility, per the
        README's explicit requirement that this logic lives here. A user can
        belong to multiple role Groups, so filters are unioned across every
        group they're in, not just the first one that matches.
        """
        if user.is_superuser:
            return self

        groups = set(user.groups.values_list("name", flat=True))
        filters = models.Q()
        matched = False

        if "Postal Officer" in groups:
            filters |= models.Q(registered_by=user)
            matched = True
        if "Head of Branch" in groups and user.department_id:
            filters |= models.Q(department_id=user.department_id)
            matched = True
        if "Sub-Branch Officer" in groups and user.sub_division_id:
            filters |= models.Q(sub_division_id=user.sub_division_id)
            matched = True
        if "Subject Officer" in groups:
            filters |= models.Q(current_holder=user)
            matched = True
        if "Viewer" in groups and user.department_id:
            filters |= models.Q(department_id=user.department_id)
            matched = True

        if not matched:
            return self.none()
        return self.filter(filters).distinct()


class Correspondence(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        ASSIGNED = "assigned", "Assigned"
        PENDING = "pending", "Pending"
        CLOSED = "closed", "Closed"

    registration_number = models.CharField(max_length=20, unique=True, editable=False)
    subject = models.CharField(max_length=300)
    sender_name = models.CharField(max_length=200)
    sender_address = models.TextField(blank=True)
    date_received = models.DateField()
    received_via = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g. Post, Hand delivery, Email, Fax.",
    )
    remarks = models.TextField(blank=True)

    # department/registered_by are PROTECTed: government record-keeping
    # means a Department or the officer who registered a letter shouldn't be
    # deletable while correspondence still references them. division/
    # sub_division/current_holder are SET_NULL instead: reorganisations
    # happen, and correspondence shouldn't block a Division rename/delete or
    # disappear because a user account was removed.
    department = models.ForeignKey(
        "orgstructure.Department", on_delete=models.PROTECT, related_name="correspondence"
    )
    division = models.ForeignKey(
        "orgstructure.Division",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="correspondence",
    )
    sub_division = models.ForeignKey(
        "orgstructure.SubDivision",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="correspondence",
    )
    current_holder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="held_correspondence",
        help_text="The specific Subject Officer currently holding this letter, if it's reached that tier.",
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    due_date = models.DateField(null=True, blank=True)

    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="registered_correspondence"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CorrespondenceQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Correspondence"

    def __str__(self):
        return f"{self.registration_number} — {self.subject}"

    @property
    def is_overdue(self):
        return bool(
            self.due_date
            and self.due_date < timezone.localdate()
            and self.status != self.Status.CLOSED
        )


class RoutingEvent(models.Model):
    """
    Immutable log of everything that happens to a piece of correspondence:
    registration, forwarding, lateral reassignment, being marked pending,
    and closing. This is the workflow's audit trail (who has the file now,
    and its history) — not a separate "audit" app, since it's core to
    running the workflow itself rather than a reporting feature.

    FORWARD advances a letter to the next tier down (and sets status to
    ASSIGNED). REASSIGN moves it laterally within the current tier — a
    different department (Head of Branch correcting a misroute), a
    different sub-division (Sub-Branch Officer), or a different named
    Subject Officer (peer handoff) — without changing status.

    sub_branch_tier_enabled_snapshot is set only on the Head-of-Branch
    FORWARD event, read from TenantWorkflowConfig.get_solo() at the moment
    of forwarding. This is what makes "in-flight letters keep following the
    rules active when they reached their current step" literally true: it's
    a per-event fact captured once, not a per-letter flag re-read live.
    """

    class Action(models.TextChoices):
        REGISTER = "register", "Registered"
        EDIT = "edit", "Edited"
        FORWARD = "forward", "Forwarded"
        REASSIGN = "reassign", "Reassigned"
        MARK_PENDING = "mark_pending", "Marked pending"
        CLOSE = "close", "Closed"

    correspondence = models.ForeignKey(
        Correspondence, on_delete=models.CASCADE, related_name="routing_events"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=20, choices=Action.choices)

    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    to_department = models.ForeignKey(
        "orgstructure.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    to_division = models.ForeignKey(
        "orgstructure.Division", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    to_sub_division = models.ForeignKey(
        "orgstructure.SubDivision", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    sub_branch_tier_enabled_snapshot = models.BooleanField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.correspondence.registration_number}: {self.get_action_display()} by {self.actor}"


ALLOWED_ATTACHMENT_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx"}
MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024  # 15MB


def attachment_upload_path(instance, filename):
    """
    Prefixed with the current tenant's schema name so different tenants'
    uploads land in different directories on disk. This is a logical
    separation, not the same strength of guarantee as the Postgres
    schema-per-tenant boundary the rest of this project relies on for
    isolation — see the MEDIA_ROOT comment in settings.py.
    """
    from django.db import connection

    return f"correspondence/{connection.schema_name}/{instance.correspondence_id}/{filename}"


class CorrespondenceAttachment(models.Model):
    correspondence = models.ForeignKey(
        Correspondence, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_filename = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.original_filename} on {self.correspondence.registration_number}"


class OutgoingCorrespondenceQuerySet(models.QuerySet):
    def visible_to(self, user):
        """
        Simpler than Correspondence.visible_to: there's no multi-tier
        routing chain to score visibility against here, just "who drafted
        it" and "what department is it filed under." A Subject Officer
        replying to a letter they hold, and a Postal Officer drafting a
        standalone letter, both show up identically via drafted_by=user —
        nobody hands an outgoing draft to someone else the way
        current_holder works for inbound, so there's no separate
        Subject-Officer-specific branch needed. The department branch is a
        genuinely different actor (oversight of a whole department's
        outgoing correspondence, not just what you personally drafted).
        """
        if user.is_superuser:
            return self

        filters = models.Q(drafted_by=user)
        groups = set(user.groups.values_list("name", flat=True))
        if ("Head of Branch" in groups or "Viewer" in groups) and user.department_id:
            filters |= models.Q(department_id=user.department_id)
        return self.filter(filters).distinct()


class OutgoingCorrespondence(models.Model):
    """
    A letter this organisation sends — either a reply to a registered
    inbound letter (in_reply_to set) or a standalone outgoing letter
    (in_reply_to null). Deliberately simpler than Correspondence: no
    RoutingEvent-equivalent audit log, because there's no view anywhere
    that edits subject/recipient_name/recipient_address/remarks/department
    after creation — the only two things that ever happen to a row are
    creation (Draft) and the send action (status/sent_by/sent_date). That
    makes updated_at a reliable proxy for "when it was sent" by
    construction, the same way Correspondence.updated_at is a reliable
    proxy for "when it was closed" once CLOSED blocks every other action —
    just simpler here since there's no routing chain to log in the first
    place. If an edit capability is ever added, that's the point to add a
    real audit trail; don't build one now for a mutation path that doesn't
    exist.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"

    reference_number = models.CharField(max_length=20, unique=True, editable=False)
    in_reply_to = models.ForeignKey(
        Correspondence, null=True, blank=True, on_delete=models.SET_NULL, related_name="replies"
    )
    subject = models.CharField(max_length=300)
    recipient_name = models.CharField(max_length=200)
    recipient_address = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    # Filing metadata only, unlike Correspondence.department — there's no
    # routing chain here, so no division/sub_division either. Set once at
    # creation and never edited (no edit view exists for this model).
    department = models.ForeignKey(
        "orgstructure.Department", on_delete=models.PROTECT, related_name="outgoing_correspondence"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    drafted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="drafted_outgoing"
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    sent_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = OutgoingCorrespondenceQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Outgoing correspondence"

    def __str__(self):
        return f"{self.reference_number} — {self.subject}"
