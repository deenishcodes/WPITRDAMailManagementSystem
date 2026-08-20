from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from .forms import WorkflowConfigForm
from .models import TenantWorkflowConfig


@login_required
def workflow_configuration(request):
    config = TenantWorkflowConfig.get_solo()

    if request.method == "POST":
        form = WorkflowConfigForm(request.POST, instance=config)
        if form.is_valid():
            form.save()
            messages.success(request, "Workflow configuration updated.")
            return redirect("workflow-configuration")
    else:
        form = WorkflowConfigForm(instance=config)

    return render(
        request,
        "orgstructure/workflow_configuration.html",
        {"form": form},
    )
