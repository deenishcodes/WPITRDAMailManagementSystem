from django.shortcuts import render

from .forms import ClientSignupForm


def signup(request):
    if request.method == "POST":
        form = ClientSignupForm(request.POST)
        if form.is_valid():
            client, domain, admin_user = form.save()
            return render(
                request,
                "signup/success.html",
                {"client": client, "domain": domain, "admin_user": admin_user},
            )
    else:
        form = ClientSignupForm()

    return render(request, "signup/signup.html", {"form": form})
