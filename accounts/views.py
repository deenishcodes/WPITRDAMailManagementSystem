from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone

from correspondence.models import Correspondence


@login_required
def dashboard(request):
    qs = Correspondence.objects.visible_to(request.user)
    counts = {
        "new": qs.filter(status=Correspondence.Status.NEW).count(),
        "assigned": qs.filter(status=Correspondence.Status.ASSIGNED).count(),
        "pending": qs.filter(status=Correspondence.Status.PENDING).count(),
        "closed": qs.filter(status=Correspondence.Status.CLOSED).count(),
        "overdue": qs.filter(due_date__lt=timezone.localdate())
        .exclude(status=Correspondence.Status.CLOSED)
        .count(),
    }
    return render(request, "accounts/dashboard.html", {"counts": counts})
