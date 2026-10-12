// Shared types for the "Manage Incoming Correspondence" feature.
// Kept separate from lib/model.ts (the legacy peon/HOD desk), which uses a different domain
// model that predates this feature.
//
// Four operational roles, each scoped to exactly one office except Admin (global):
//   admin  — technical system administrator: manages offices, users, role/office assignment.
//            Not granted to any other role by default.
//   peon   — "Peon/admin": letter entry & handling clerk for one office. Registers incoming
//            letters, scans originals, records the physical register/book reference, and
//            records physical handover once a HOD has authorised forwarding to another office.
//            Does not choose the responsible officer or redirect a letter on their own.
//   hod    — Head of Department: reviews newly registered letters for their own office, assigns
//            them to an officer in that office, authorises forwarding to another office, and
//            reassigns returned or misassigned work. Monitors all progress within their office.
//   officer — works letters assigned to them within their own office: accepts or returns an
//            assignment (with a reason), and records the work performed and its outcome.
export type Role = 'admin' | 'peon' | 'hod' | 'officer';

export const ROLES: Role[] = ['admin', 'peon', 'hod', 'officer'];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'SUPER AUTHORITY',
  peon: 'PEON',
  hod: 'HOD',
  officer: 'OFFICER',
};

// registered        — logged by Peon/admin, awaiting the office HOD's review
// assigned          — HOD has assigned it to an officer, awaiting accept/return
// in_progress       — officer accepted and is working it
// returned_to_hod   — officer returned an incorrect assignment; HOD must reassign
// forward_pending   — HOD authorised forwarding to another office; awaiting Peon/admin to record
//                     the physical handover
// done              — officer recorded the work performed and its outcome (terminal)
export type LetterStatus =
  | 'registered'
  | 'assigned'
  | 'in_progress'
  | 'returned_to_hod'
  | 'forward_pending'
  | 'done';

export const STATUS_LABEL: Record<LetterStatus, string> = {
  registered: 'Registered — awaiting HOD review',
  assigned: 'Assigned — awaiting officer',
  in_progress: 'In progress',
  returned_to_hod: 'Returned to HOD',
  forward_pending: 'Forwarding authorised — awaiting handover',
  done: 'Done',
};

export type LetterSource = 'physical' | 'email';

export type AttachmentKind = 'scan' | 'supporting';

export type CorrUser = {
  id: string;
  externalId: string | null;
  email: string;
  displayName: string;
  phone: string | null;
  role: Role;
  officeId: string | null; // null only for admin
  isActive: boolean;
  createdAt: number;
};

export type Office = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Attachment = {
  id: string;
  letterId: string;
  kind: AttachmentKind;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByUserId: string | null;
  uploadedAt: number;
};

export type Movement = {
  id: string;
  letterId: string;
  at: number;
  actorUserId: string | null;
  actorName: string;
  actorRole: string;
  type: string;
  fromOfficeId: string | null;
  toOfficeId: string | null;
  fromOfficerId: string | null;
  toOfficerId: string | null;
  note: string;
};

export type Letter = {
  id: string;
  referenceNumber: string;
  source: LetterSource;
  subject: string;
  senderName: string;
  senderContact: string | null;
  receivedAt: number;
  registeredAt: number;
  registeredByUserId: string | null;
  originalLocationNote: string | null;
  officeId: string;
  assignedOfficerId: string | null;
  status: LetterStatus;
  forwardToOfficeId: string | null;
  forwardAuthorisedByUserId: string | null;
  forwardAuthorisedAt: number | null;
  lastReturnReason: string | null;
  lastReturnAt: number | null;
  outcomeText: string | null;
  outcomeRecordedAt: number | null;
  outcomeRecordedByUserId: string | null;
  lastCorrectionAt: number | null;
};

export type NotificationRow = {
  id: string;
  userId: string;
  letterId: string | null;
  type: 'assignment' | 'returned' | 'reassignment' | 'forward_authorised';
  message: string;
  createdAt: number;
  readAt: number | null;
};

export type NotificationLogRow = {
  id: string;
  channel: 'email' | 'sms' | 'in_app';
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  letterId: string | null;
  createdAt: number;
};

export type Mailbox = {
  id: string;
  officeId: string;
  provider: string;
  address: string;
  isActive: boolean;
  createdAt: number;
};

export function requireRole(role: Role, allowed: Role[]): void {
  if (!allowed.includes(role)) {
    throw new Error(`Forbidden: your ${ROLE_LABEL[role]} role does not have access to this action.`);
  }
}

export function text(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
