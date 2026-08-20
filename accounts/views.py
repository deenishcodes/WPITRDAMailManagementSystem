from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def dashboard(request):
    """
    Deliberately minimal placeholder — proves login + auth works.
    The real dashboard (new/assigned/pending/overdue/closed counts,
    Section 6) is Phase 2f, once correspondence exists to count.
    """
    return render(request, "accounts/dashboard.html")
