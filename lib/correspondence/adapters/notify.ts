// --- email-service / sms-service integration point ---
// The organization has registered `email-service` and `sms-service` for outbound notifications.
// Neither is reachable from this environment, so both are mocked here: instead of calling out,
// every send is written to `corr_notification_log` so delivery stays inspectable (Admin >
// Notification log) and testable without live credentials. Replace the bodies of `sendEmail`
// and `sendSms` with calls to the registered services when they become available — nothing else
// under lib/correspondence needs to change, since callers only see "delivered" vs "skipped".
export async function sendEmail(
  db: D1Database,
  to: string,
  subject: string,
  body: string,
  letterId?: string | null,
): Promise<void> {
  await logDelivery(db, 'email', to, subject, body, 'sent (mocked)', letterId ?? null);
}

// SMS is sent to the phone number on the user's SSO profile attributes; a user with no phone
// number on file simply does not receive the SMS leg (recorded here as "skipped" rather than
// silently dropped, so it's visible in the outbox).
export async function sendSms(
  db: D1Database,
  to: string | null | undefined,
  body: string,
  letterId?: string | null,
): Promise<void> {
  if (!to) {
    await logDelivery(db, 'sms', '(no phone on file)', null, body, 'skipped — no phone on file', letterId ?? null);
    return;
  }
  await logDelivery(db, 'sms', to, null, body, 'sent (mocked)', letterId ?? null);
}

export async function notifyInApp(
  db: D1Database,
  userId: string,
  type: 'assignment' | 'returned' | 'reassignment' | 'forward_authorised',
  message: string,
  letterId?: string | null,
): Promise<void> {
  await db
    .prepare('INSERT INTO corr_notifications (id,user_id,letter_id,type,message,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), userId, letterId ?? null, type, message, Date.now())
    .run();
  await logDelivery(db, 'in_app', userId, null, message, 'sent', letterId ?? null);
}

async function logDelivery(
  db: D1Database,
  channel: string,
  recipient: string,
  subject: string | null,
  body: string,
  status: string,
  letterId: string | null,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO corr_notification_log (id,channel,recipient,subject,body,status,letter_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), channel, recipient, subject, body, status, letterId, Date.now())
    .run();
}
