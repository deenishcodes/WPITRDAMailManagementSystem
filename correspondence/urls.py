from django.urls import path

from . import views

urlpatterns = [
    path("correspondence/", views.correspondence_list, name="correspondence-list"),
    path("correspondence/reports/", views.correspondence_reports, name="correspondence-reports"),
    path("correspondence/register/", views.correspondence_register, name="correspondence-register"),
    path(
        "correspondence/bulk-register/",
        views.correspondence_bulk_register,
        name="correspondence-bulk-register",
    ),
    path(
        "correspondence/bulk-register/template.csv",
        views.correspondence_bulk_register_template,
        name="correspondence-bulk-register-template",
    ),
    path("correspondence/outgoing/", views.outgoing_list, name="outgoing-list"),
    path("correspondence/outgoing/new/", views.outgoing_register, name="outgoing-register"),
    path("correspondence/outgoing/<int:pk>/", views.outgoing_detail, name="outgoing-detail"),
    path("correspondence/outgoing/<int:pk>/send/", views.outgoing_send, name="outgoing-send"),
    path("correspondence/<int:pk>/", views.correspondence_detail, name="correspondence-detail"),
    path("correspondence/<int:pk>/edit/", views.correspondence_edit, name="correspondence-edit"),
    path("correspondence/<int:pk>/reply/", views.correspondence_reply, name="correspondence-reply"),
    path("correspondence/<int:pk>/forward/", views.correspondence_forward, name="correspondence-forward"),
    path("correspondence/<int:pk>/reassign/", views.correspondence_reassign, name="correspondence-reassign"),
    path(
        "correspondence/<int:pk>/pending/",
        views.correspondence_mark_pending,
        name="correspondence-mark-pending",
    ),
    path("correspondence/<int:pk>/close/", views.correspondence_close, name="correspondence-close"),
    path(
        "correspondence/<int:pk>/attachments/upload/",
        views.correspondence_upload_attachment,
        name="correspondence-upload-attachment",
    ),
    path(
        "correspondence/<int:pk>/attachments/<int:attachment_id>/",
        views.correspondence_download_attachment,
        name="correspondence-download-attachment",
    ),
]
