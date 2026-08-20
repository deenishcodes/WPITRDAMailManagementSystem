import csv
import io

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db import models, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.dateparse import parse_date

from orgstructure.models import Department, TenantWorkflowConfig

from .forms import (
    BulkRegisterForm,
    CorrespondenceRegisterForm,
    ForwardToSubDivisionForm,
    ForwardToUserForm,
    MarkPendingForm,
    ReassignDepartmentForm,
)
from .models import Correspondence, RoutingEvent, next_registration_number

User = get_user_model()

BULK_REQUIRED_CSV_COLUMNS = {"subject", "sender_name", "date_received", "department"}


def _in_group(user, name):
    return user.is_superuser or user.groups.filter(name=name).exists()


def _at_head_of_branch_stage(correspondence):
    """Still sitting at department level: not yet routed to a sub-division or a named officer."""
    return correspondence.current_holder_id is None and correspondence.sub_division_id is None


def _at_sub_branch_stage(correspondence):
    """Routed to a sub-division, waiting for the Sub-Branch Officer to name a Subject Officer."""
    return correspondence.sub_division_id is not None and correspondence.current_holder_id is None


def _can_forward(user, correspondence):
    if correspondence.status == Correspondence.Status.CLOSED:
        return False
    if user.is_superuser:
        return True
    groups = set(user.groups.values_list("name", flat=True))
    if "Head of Branch" in groups and _at_head_of_branch_stage(correspondence):
        return correspondence.department_id == user.department_id
    if "Sub-Branch Officer" in groups and _at_sub_branch_stage(correspondence):
        return correspondence.sub_division_id == user.sub_division_id
    return False


def _can_reassign(user, correspondence):
    """
    Lateral move within the current tier, as opposed to _can_forward's
    advance-to-the-next-tier. Available to the same actor who could
    otherwise act on the letter at its current stage.
    """
    if correspondence.status == Correspondence.Status.CLOSED:
        return False
    if user.is_superuser:
        return True
    groups = set(user.groups.values_list("name", flat=True))
    if "Head of Branch" in groups and _at_head_of_branch_stage(correspondence):
        return correspondence.department_id == user.department_id
    if "Sub-Branch Officer" in groups and _at_sub_branch_stage(correspondence):
        return correspondence.sub_division_id == user.sub_division_id
    if "Subject Officer" in groups and correspondence.current_holder_id == user.id:
        return True
    return False


def _can_act_as_holder(user, correspondence):
    """Mark-pending / close: only the named current holder (or a superuser)."""
    if correspondence.status == Correspondence.Status.CLOSED:
        return False
    if user.is_superuser:
        return True
    return correspondence.current_holder_id == user.id


def _redirect_after_action(request, correspondence):
    """
    Reassignment (and, less commonly, forwarding) can move a letter out of
    the acting user's own visible scope — that's the point of a handoff.
    Send them back to the detail page only if they can still see it;
    otherwise the list, so a successful action doesn't immediately 404 the
    person who just performed it.
    """
    if Correspondence.objects.visible_to(request.user).filter(pk=correspondence.pk).exists():
        return redirect("correspondence-detail", pk=correspondence.pk)
    return redirect("correspondence-list")


@login_required
def correspondence_list(request):
    qs = Correspondence.objects.visible_to(request.user).select_related(
        "department", "division", "sub_division", "current_holder"
    )

    status = request.GET.get("status")
    if status in Correspondence.Status.values:
        qs = qs.filter(status=status)

    query = request.GET.get("q", "").strip()
    if query:
        qs = qs.filter(
            models.Q(registration_number__icontains=query)
            | models.Q(subject__icontains=query)
            | models.Q(sender_name__icontains=query)
        )

    paginator = Paginator(qs, 25)
    page_obj = paginator.get_page(request.GET.get("page"))

    return render(
        request,
        "correspondence/list.html",
        {
            "page_obj": page_obj,
            "status_choices": Correspondence.Status.choices,
            "current_status": status,
            "query": query,
        },
    )


@login_required
def correspondence_register(request):
    if not _in_group(request.user, "Postal Officer"):
        raise PermissionDenied("Only Postal Officers can register correspondence.")

    if request.method == "POST":
        form = CorrespondenceRegisterForm(request.POST)
        if form.is_valid():
            with transaction.atomic():
                correspondence = form.save(commit=False)
                correspondence.registration_number = next_registration_number()
                correspondence.registered_by = request.user
                correspondence.status = Correspondence.Status.NEW
                correspondence.save()
                RoutingEvent.objects.create(
                    correspondence=correspondence,
                    actor=request.user,
                    action=RoutingEvent.Action.REGISTER,
                    to_department=correspondence.department,
                )
            messages.success(request, f"Registered as {correspondence.registration_number}.")
            return redirect("correspondence-detail", pk=correspondence.pk)
    else:
        form = CorrespondenceRegisterForm()

    return render(request, "correspondence/register.html", {"form": form})


def _parse_bulk_csv(csv_file):
    """
    Returns (rows, errors). rows is a list of dicts ready to pass straight
    into Correspondence.objects.create(**row); errors is a list of
    human-readable problems. Validates every row before anything is
    created — bulk registration is all-or-nothing (see
    correspondence_bulk_register), so a row error must surface here rather
    than partway through a save loop.
    """
    try:
        decoded = csv_file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return [], ["Could not read the file as UTF-8 text."]

    reader = csv.DictReader(io.StringIO(decoded))
    if reader.fieldnames is None:
        return [], ["File is empty."]

    missing_columns = BULK_REQUIRED_CSV_COLUMNS - set(reader.fieldnames)
    if missing_columns:
        return [], [f"Missing required column(s): {', '.join(sorted(missing_columns))}."]

    departments_by_key = {}
    for dept in Department.objects.all():
        departments_by_key[dept.name.strip().lower()] = dept
        if dept.short_code:
            departments_by_key[dept.short_code.strip().lower()] = dept

    rows = []
    errors = []
    for line_number, row in enumerate(reader, start=2):  # header is line 1
        subject = (row.get("subject") or "").strip()
        sender_name = (row.get("sender_name") or "").strip()
        date_received_raw = (row.get("date_received") or "").strip()
        due_date_raw = (row.get("due_date") or "").strip()
        department_raw = (row.get("department") or "").strip()

        row_errors = []
        if not subject:
            row_errors.append("subject is required")
        if not sender_name:
            row_errors.append("sender_name is required")

        date_received = parse_date(date_received_raw) if date_received_raw else None
        if not date_received:
            row_errors.append(f"date_received '{date_received_raw}' is not a valid YYYY-MM-DD date")

        due_date = None
        if due_date_raw:
            due_date = parse_date(due_date_raw)
            if not due_date:
                row_errors.append(f"due_date '{due_date_raw}' is not a valid YYYY-MM-DD date")

        department = departments_by_key.get(department_raw.lower())
        if not department:
            row_errors.append(f"department '{department_raw}' not found")

        if row_errors:
            errors.append(f"Row {line_number}: " + "; ".join(row_errors))
            continue

        rows.append(
            {
                "subject": subject,
                "sender_name": sender_name,
                "sender_address": (row.get("sender_address") or "").strip(),
                "date_received": date_received,
                "received_via": (row.get("received_via") or "").strip(),
                "remarks": (row.get("remarks") or "").strip(),
                "department": department,
                "due_date": due_date,
            }
        )

    return rows, errors


@login_required
def correspondence_bulk_register(request):
    if not _in_group(request.user, "Postal Officer"):
        raise PermissionDenied("Only Postal Officers can register correspondence.")

    errors = []

    if request.method == "POST":
        form = BulkRegisterForm(request.POST, request.FILES)
        if form.is_valid():
            rows, errors = _parse_bulk_csv(form.cleaned_data["csv_file"])
            if not errors and not rows:
                errors = ["No data rows found in the file."]
            if not errors:
                with transaction.atomic():
                    for row in rows:
                        correspondence = Correspondence.objects.create(
                            registration_number=next_registration_number(),
                            registered_by=request.user,
                            status=Correspondence.Status.NEW,
                            **row,
                        )
                        RoutingEvent.objects.create(
                            correspondence=correspondence,
                            actor=request.user,
                            action=RoutingEvent.Action.REGISTER,
                            to_department=correspondence.department,
                        )
                messages.success(request, f"Registered {len(rows)} letters.")
                return redirect("correspondence-list")
    else:
        form = BulkRegisterForm()

    return render(
        request,
        "correspondence/bulk_register.html",
        {"form": form, "errors": errors},
    )


@login_required
def correspondence_bulk_register_template(request):
    if not _in_group(request.user, "Postal Officer"):
        raise PermissionDenied("Only Postal Officers can register correspondence.")

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="correspondence_bulk_template.csv"'
    writer = csv.writer(response)
    writer.writerow(
        [
            "subject",
            "sender_name",
            "sender_address",
            "date_received",
            "received_via",
            "remarks",
            "department",
            "due_date",
        ]
    )
    writer.writerow(
        [
            "Land title dispute - Lot 42",
            "A. Perera",
            "123 Main St, Colombo",
            "2026-08-20",
            "Post",
            "",
            "Land Administration",
            "",
        ]
    )
    return response


@login_required
def correspondence_detail(request, pk):
    correspondence = get_object_or_404(
        Correspondence.objects.visible_to(request.user).select_related(
            "department", "division", "sub_division", "current_holder", "registered_by"
        ),
        pk=pk,
    )
    events = correspondence.routing_events.select_related(
        "actor", "to_user", "to_department", "to_division", "to_sub_division"
    )

    return render(
        request,
        "correspondence/detail.html",
        {
            "correspondence": correspondence,
            "events": events,
            "can_forward": _can_forward(request.user, correspondence),
            "can_reassign": _can_reassign(request.user, correspondence),
            "can_act_as_holder": _can_act_as_holder(request.user, correspondence),
        },
    )


@login_required
def correspondence_forward(request, pk):
    correspondence = get_object_or_404(Correspondence.objects.visible_to(request.user), pk=pk)
    if not _can_forward(request.user, correspondence):
        raise PermissionDenied("You can't forward this letter.")

    head_of_branch_stage = _at_head_of_branch_stage(correspondence)
    tier_enabled = None
    if head_of_branch_stage:
        tier_enabled = TenantWorkflowConfig.get_solo().sub_branch_tier_enabled

    if head_of_branch_stage and tier_enabled:
        form_class = ForwardToSubDivisionForm
        form_kwargs = {"department": correspondence.department}
    elif head_of_branch_stage:
        form_class = ForwardToUserForm
        form_kwargs = {
            "queryset": User.objects.filter(
                groups__name="Subject Officer", department=correspondence.department
            ).distinct()
        }
    else:
        form_class = ForwardToUserForm
        form_kwargs = {
            "queryset": User.objects.filter(
                groups__name="Subject Officer", sub_division=correspondence.sub_division
            ).distinct()
        }

    if request.method == "POST":
        form = form_class(request.POST, **form_kwargs)
        if form.is_valid():
            note = form.cleaned_data.get("note", "")
            with transaction.atomic():
                if head_of_branch_stage and tier_enabled:
                    sub_division = form.cleaned_data["sub_division"]
                    correspondence.division = sub_division.division
                    correspondence.sub_division = sub_division
                    correspondence.status = Correspondence.Status.ASSIGNED
                    correspondence.save(update_fields=["division", "sub_division", "status", "updated_at"])
                    RoutingEvent.objects.create(
                        correspondence=correspondence,
                        actor=request.user,
                        action=RoutingEvent.Action.FORWARD,
                        to_division=sub_division.division,
                        to_sub_division=sub_division,
                        sub_branch_tier_enabled_snapshot=True,
                        note=note,
                    )
                else:
                    to_user = form.cleaned_data["to_user"]
                    correspondence.current_holder = to_user
                    correspondence.status = Correspondence.Status.ASSIGNED
                    correspondence.save(update_fields=["current_holder", "status", "updated_at"])
                    RoutingEvent.objects.create(
                        correspondence=correspondence,
                        actor=request.user,
                        action=RoutingEvent.Action.FORWARD,
                        to_user=to_user,
                        sub_branch_tier_enabled_snapshot=(False if head_of_branch_stage else None),
                        note=note,
                    )
            messages.success(request, "Forwarded.")
            return _redirect_after_action(request, correspondence)
    else:
        form = form_class(**form_kwargs)

    return render(
        request,
        "correspondence/forward.html",
        {"correspondence": correspondence, "form": form},
    )


@login_required
def correspondence_reassign(request, pk):
    correspondence = get_object_or_404(Correspondence.objects.visible_to(request.user), pk=pk)
    if not _can_reassign(request.user, correspondence):
        raise PermissionDenied("You can't reassign this letter.")

    if _at_head_of_branch_stage(correspondence):
        form_class = ReassignDepartmentForm
        form_kwargs = {}
    elif _at_sub_branch_stage(correspondence):
        form_class = ForwardToSubDivisionForm
        form_kwargs = {"department": correspondence.department}
    else:
        queryset = User.objects.filter(groups__name="Subject Officer").exclude(
            pk=correspondence.current_holder_id
        )
        if correspondence.sub_division_id:
            queryset = queryset.filter(sub_division_id=correspondence.sub_division_id)
        else:
            queryset = queryset.filter(department_id=correspondence.department_id)
        form_class = ForwardToUserForm
        form_kwargs = {"queryset": queryset.distinct()}

    if request.method == "POST":
        form = form_class(request.POST, **form_kwargs)
        if form.is_valid():
            note = form.cleaned_data.get("note", "")
            with transaction.atomic():
                if form_class is ReassignDepartmentForm:
                    new_department = form.cleaned_data["department"]
                    correspondence.department = new_department
                    correspondence.save(update_fields=["department", "updated_at"])
                    RoutingEvent.objects.create(
                        correspondence=correspondence,
                        actor=request.user,
                        action=RoutingEvent.Action.REASSIGN,
                        to_department=new_department,
                        note=note,
                    )
                elif form_class is ForwardToSubDivisionForm:
                    sub_division = form.cleaned_data["sub_division"]
                    correspondence.division = sub_division.division
                    correspondence.sub_division = sub_division
                    correspondence.save(update_fields=["division", "sub_division", "updated_at"])
                    RoutingEvent.objects.create(
                        correspondence=correspondence,
                        actor=request.user,
                        action=RoutingEvent.Action.REASSIGN,
                        to_division=sub_division.division,
                        to_sub_division=sub_division,
                        note=note,
                    )
                else:
                    to_user = form.cleaned_data["to_user"]
                    correspondence.current_holder = to_user
                    correspondence.save(update_fields=["current_holder", "updated_at"])
                    RoutingEvent.objects.create(
                        correspondence=correspondence,
                        actor=request.user,
                        action=RoutingEvent.Action.REASSIGN,
                        to_user=to_user,
                        note=note,
                    )
            messages.success(request, "Reassigned.")
            return _redirect_after_action(request, correspondence)
    else:
        form = form_class(**form_kwargs)

    return render(
        request,
        "correspondence/reassign.html",
        {"correspondence": correspondence, "form": form},
    )


@login_required
def correspondence_mark_pending(request, pk):
    correspondence = get_object_or_404(Correspondence.objects.visible_to(request.user), pk=pk)
    if not _can_act_as_holder(request.user, correspondence):
        raise PermissionDenied("You can't update this letter.")

    if request.method == "POST":
        form = MarkPendingForm(request.POST)
        if form.is_valid():
            correspondence.status = Correspondence.Status.PENDING
            correspondence.save(update_fields=["status", "updated_at"])
            RoutingEvent.objects.create(
                correspondence=correspondence,
                actor=request.user,
                action=RoutingEvent.Action.MARK_PENDING,
                note=form.cleaned_data["note"],
            )
            messages.success(request, "Marked as pending.")
        else:
            messages.error(request, "Please explain what this letter is waiting on.")

    return redirect("correspondence-detail", pk=pk)


@login_required
def correspondence_close(request, pk):
    correspondence = get_object_or_404(Correspondence.objects.visible_to(request.user), pk=pk)
    if not _can_act_as_holder(request.user, correspondence):
        raise PermissionDenied("You can't close this letter.")

    if request.method == "POST":
        correspondence.status = Correspondence.Status.CLOSED
        correspondence.save(update_fields=["status", "updated_at"])
        RoutingEvent.objects.create(
            correspondence=correspondence,
            actor=request.user,
            action=RoutingEvent.Action.CLOSE,
            note=request.POST.get("note", ""),
        )
        messages.success(request, "Closed.")

    return redirect("correspondence-detail", pk=pk)
