from django.urls import path

from . import views

urlpatterns = [
    path("correspondence/", views.correspondence_list, name="correspondence-list"),
    path("correspondence/register/", views.correspondence_register, name="correspondence-register"),
    path("correspondence/<int:pk>/", views.correspondence_detail, name="correspondence-detail"),
    path("correspondence/<int:pk>/forward/", views.correspondence_forward, name="correspondence-forward"),
    path(
        "correspondence/<int:pk>/pending/",
        views.correspondence_mark_pending,
        name="correspondence-mark-pending",
    ),
    path("correspondence/<int:pk>/close/", views.correspondence_close, name="correspondence-close"),
]
