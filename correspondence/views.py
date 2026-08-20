from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render

from orgstructure.models import TenantWorkflowConfig

from .forms import (
    CorrespondenceRegisterForm,
    ForwardToSubDivisionForm,
    ForwardToUserForm,
    MarkPendingForm,
    ReassignDepartmentForm,
)
from .models import Correspondence, RoutingEvent, next_registration_number

User = get_user_model()


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

    paginator = Paginator(qs, 25)
    page_obj = paginator.get_page(request.GET.get("page"))

    return render(
        request,
        "correspondence/list.html",
        {
            "page_obj": page_obj,
            "status_choices": Correspondence.Status.choices,
            "current_status": status,
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
