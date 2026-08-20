from django.shortcuts import render

from .forms import ClientSignupForm


def signup(request):
    if request.method == "POST":
        form = ClientSignupForm(request.POST)
        if form.is_valid():
            client, domain = form.save()
            return render(
                request,
                "signup/success.html",
                {"client": client, "domain": domain},
            )
    else:
        form = ClientSignupForm()

    return render(request, "signup/signup.html", {"form": form})
