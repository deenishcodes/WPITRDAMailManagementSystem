"""
Email notifications for the correspondence workflow. Deliberately narrow:
only the two moments where a *specific named person* newly becomes
responsible for something get an email. Department/sub-division-level
forwards (Head of Branch -> a Sub-Branch, or a Head of Branch/Sub-Branch
Officer reassignment that only changes an org-unit target) don't have a
single obvious recipient -- notifying every member of a whole Group would
be noisy and wasn't asked for, so those are skipped rather than guessed at.

Failure to send is logged, not raised -- a broken email setup or a user
with no email address on file shouldn't block the actual workflow action
that triggered the notification.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, message, recipient):
    if not recipient or not recipient.email:
        return
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [recipient.email],
            fail_silently=False,
        )
    except Exception:
        logger.warning("Failed to send notification email to %s", recipient.email, exc_info=True)


def notify_new_holder(correspondence, recipient):
    """Sent when `recipient` becomes the named current_holder of a letter (forward or reassignment)."""
    _send(
        subject=f"[MMS] {correspondence.registration_number} assigned to you",
        message=(
            f"{correspondence.registration_number} ({correspondence.subject}) "
            f"has been assigned to you.\n\n"
            f"Sender: {correspondence.sender_name}\n"
            f"Department: {correspondence.department}\n"
            f"Date received: {correspondence.date_received}\n"
        ),
        recipient=recipient,
    )


def notify_registrant_closed(correspondence):
    """Sent to whoever registered a letter when it's closed."""
    _send(
        subject=f"[MMS] {correspondence.registration_number} closed",
        message=(
            f"{correspondence.registration_number} ({correspondence.subject}), "
            f"which you registered, has been closed.\n"
        ),
        recipient=correspondence.registered_by,
    )
