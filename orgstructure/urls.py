from django.urls import path

from . import views

urlpatterns = [
    path("workflow-configuration/", views.workflow_configuration, name="workflow-configuration"),
]
