import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{owner:text('owner').primaryKey(),version:integer('version').notNull().default(0),data:text('data').notNull()});

export const peonSessions=sqliteTable('peon_sessions',{token:text('token').primaryKey(),owner:text('owner').notNull(),expires:integer('expires').notNull()});
export const peonLoginAttempts=sqliteTable('peon_login_attempts',{owner:text('owner').primaryKey(),attempts:integer('attempts').notNull(),resetAt:integer('reset_at').notNull()});

// --- Manage Incoming Correspondence ---
// A separate, normalized area of the schema for the correspondence-tracking feature. Kept apart
// from the single-JSON-blob `workspaces` table above (used by the legacy peon/HOD desk) because
// this feature's search/filter and audit-trail requirements are a natural fit for relational
// rows, not a document blob.
//
// Domain model (four operational roles): Admin (technical system administrator: manages offices,
// users, role/office assignment), Peon/admin (per-office letter entry & handling clerk), HOD
// (Head of Department: reviews, assigns and monitors within their own office), Officer (works
// assigned letters within their own office). See lib/correspondence/types.ts for the full
// permission matrix this schema supports.

export const corrOffices=sqliteTable('corr_offices',{
  id:text('id').primaryKey(),
  name:text('name').notNull(),
  isActive:integer('is_active',{mode:'boolean'}).notNull().default(true),
  createdAt:integer('created_at').notNull(),
  updatedAt:integer('updated_at').notNull(),
});

// One row per onboarded person. Admin onboards by email (SSO identities aren't enumerable ahead
// of time); `externalId` starts null and is filled in the first time that email signs in via SSO
// (see resolveCurrentUser in service.ts), mirroring how the legacy desk's `principal()` binds an
// account on first login. Peon/admin, HOD and Officer each belong to exactly one office; Admin is
// a global role and has no office.
export const corrUsers=sqliteTable('corr_users',{
  id:text('id').primaryKey(),
  externalId:text('external_id'),
  email:text('email').notNull(),
  displayName:text('display_name').notNull(),
  phone:text('phone'),
  role:text('role').notNull(), // admin | peon | hod | officer
  officeId:text('office_id'),
  isActive:integer('is_active',{mode:'boolean'}).notNull().default(true),
  createdAt:integer('created_at').notNull(),
});

export const corrLetters=sqliteTable('corr_letters',{
  id:text('id').primaryKey(),
  referenceNumber:text('reference_number').notNull(), // physical register/book reference, recorded by Peon
  source:text('source').notNull(), // physical | email
  subject:text('subject').notNull(),
  senderName:text('sender_name').notNull(),
  senderContact:text('sender_contact'),
  receivedAt:integer('received_at').notNull(),
  registeredAt:integer('registered_at').notNull(),
  registeredByUserId:text('registered_by_user_id'),
  originalLocationNote:text('original_location_note'), // where the physical original currently sits
  officeId:text('office_id').notNull(), // the office the letter is currently sitting with
  assignedOfficerId:text('assigned_officer_id'),
  // registered | assigned | in_progress | returned_to_hod | forward_pending | done
  status:text('status').notNull(),
  forwardToOfficeId:text('forward_to_office_id'), // set while a HOD-authorised forward is pending physical handover
  forwardAuthorisedByUserId:text('forward_authorised_by_user_id'),
  forwardAuthorisedAt:integer('forward_authorised_at'),
  lastReturnReason:text('last_return_reason'),
  lastReturnAt:integer('last_return_at'),
  outcomeText:text('outcome_text'),
  outcomeRecordedAt:integer('outcome_recorded_at'),
  outcomeRecordedByUserId:text('outcome_recorded_by_user_id'),
  lastCorrectionAt:integer('last_correction_at'),
});

// Append-only audit trail: one row per movement/action on a letter.
export const corrLetterMovements=sqliteTable('corr_letter_movements',{
  id:text('id').primaryKey(),
  letterId:text('letter_id').notNull(),
  at:integer('at').notNull(),
  actorUserId:text('actor_user_id'),
  actorName:text('actor_name').notNull(),
  actorRole:text('actor_role').notNull(),
  type:text('type').notNull(),
  fromOfficeId:text('from_office_id'),
  toOfficeId:text('to_office_id'),
  fromOfficerId:text('from_officer_id'),
  toOfficerId:text('to_officer_id'),
  note:text('note').notNull(),
});

export const corrLetterAttachments=sqliteTable('corr_letter_attachments',{
  id:text('id').primaryKey(),
  letterId:text('letter_id').notNull(),
  kind:text('kind').notNull(), // scan | supporting
  storageKey:text('storage_key').notNull(),
  fileName:text('file_name').notNull(),
  mimeType:text('mime_type').notNull(),
  size:integer('size').notNull(),
  uploadedByUserId:text('uploaded_by_user_id'),
  uploadedAt:integer('uploaded_at').notNull(),
});

// In-app notification center (one of the three required delivery channels).
export const corrNotifications=sqliteTable('corr_notifications',{
  id:text('id').primaryKey(),
  userId:text('user_id').notNull(),
  letterId:text('letter_id'),
  type:text('type').notNull(), // assignment | returned | reassignment | forward_authorised
  message:text('message').notNull(),
  createdAt:integer('created_at').notNull(),
  readAt:integer('read_at'),
});

// Mock outbox for the email/SMS adapters (see lib/correspondence/adapters/notify.ts) so every
// notification stays inspectable without live email-service / sms-service credentials.
export const corrNotificationLog=sqliteTable('corr_notification_log',{
  id:text('id').primaryKey(),
  channel:text('channel').notNull(), // email | sms | in_app
  recipient:text('recipient').notNull(),
  subject:text('subject'),
  body:text('body').notNull(),
  status:text('status').notNull(),
  letterId:text('letter_id'),
  createdAt:integer('created_at').notNull(),
});

// Admin-configured mailboxes that feed automatic email intake — one per office.
export const corrMailboxes=sqliteTable('corr_mailboxes',{
  id:text('id').primaryKey(),
  officeId:text('office_id').notNull(),
  provider:text('provider').notNull(),
  address:text('address').notNull(),
  isActive:integer('is_active',{mode:'boolean'}).notNull().default(true),
  createdAt:integer('created_at').notNull(),
});

// Mock inbound-email queue standing in for the real provider's inbox API. Rows are added here by
// the "Simulate incoming email" dev tool and turned into letters by the email-intake run.
export const corrMockInbox=sqliteTable('corr_mock_inbox',{
  id:text('id').primaryKey(),
  mailboxId:text('mailbox_id').notNull(),
  fromAddress:text('from_address').notNull(),
  subject:text('subject').notNull(),
  body:text('body').notNull(),
  receivedAt:integer('received_at').notNull(),
  processed:integer('processed',{mode:'boolean'}).notNull().default(false),
});

// Opaque server sessions for the four fixed WPITRDA accounts.
export const roleSessions=sqliteTable('role_sessions',{token:text('token').primaryKey(),owner:text('owner').notNull(),email:text('email').notNull(),expires:integer('expires').notNull()});
