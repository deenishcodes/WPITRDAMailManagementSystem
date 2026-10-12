import { accountForEmail } from '../role-accounts';
import type { PlatformIdentity } from './adapters/identity';
import { sendEmail, sendSms, notifyInApp } from './adapters/notify';
import {
  ROLE_LABEL,
  requireRole,
  text,
  type Role,
  type LetterStatus,
  type CorrUser,
  type Office,
  type Letter,
  type Movement,
  type Attachment,
  type NotificationRow,
  type NotificationLogRow,
  type Mailbox,
} from './types';

const uid = () => crypto.randomUUID();
const dateCode = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .replaceAll('-', '');

// ---------- row -> type mapping ----------

function mapUser(r: Record<string, unknown>): CorrUser {
  return {
    id: r.id as string,
    externalId: (r.external_id as string) ?? null,
    email: r.email as string,
    displayName: r.display_name as string,
    phone: (r.phone as string) ?? null,
    role: r.role as Role,
    officeId: (r.office_id as string) ?? null,
    isActive: !!r.is_active,
    createdAt: r.created_at as number,
  };
}

function mapOffice(r: Record<string, unknown>): Office {
  return {
    id: r.id as string,
    name: r.name as string,
    isActive: !!r.is_active,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function mapLetter(r: Record<string, unknown>): Letter {
  return {
    id: r.id as string,
    referenceNumber: r.reference_number as string,
    source: r.source as Letter['source'],
    subject: r.subject as string,
    senderName: r.sender_name as string,
    senderContact: (r.sender_contact as string) ?? null,
    receivedAt: r.received_at as number,
    registeredAt: r.registered_at as number,
    registeredByUserId: (r.registered_by_user_id as string) ?? null,
    originalLocationNote: (r.original_location_note as string) ?? null,
    officeId: r.office_id as string,
    assignedOfficerId: (r.assigned_officer_id as string) ?? null,
    status: r.status as LetterStatus,
    forwardToOfficeId: (r.forward_to_office_id as string) ?? null,
    forwardAuthorisedByUserId: (r.forward_authorised_by_user_id as string) ?? null,
    forwardAuthorisedAt: (r.forward_authorised_at as number) ?? null,
    lastReturnReason: (r.last_return_reason as string) ?? null,
    lastReturnAt: (r.last_return_at as number) ?? null,
    outcomeText: (r.outcome_text as string) ?? null,
    outcomeRecordedAt: (r.outcome_recorded_at as number) ?? null,
    outcomeRecordedByUserId: (r.outcome_recorded_by_user_id as string) ?? null,
    lastCorrectionAt: (r.last_correction_at as number) ?? null,
  };
}

function mapMovement(r: Record<string, unknown>): Movement {
  return {
    id: r.id as string,
    letterId: r.letter_id as string,
    at: r.at as number,
    actorUserId: (r.actor_user_id as string) ?? null,
    actorName: r.actor_name as string,
    actorRole: r.actor_role as string,
    type: r.type as string,
    fromOfficeId: (r.from_office_id as string) ?? null,
    toOfficeId: (r.to_office_id as string) ?? null,
    fromOfficerId: (r.from_officer_id as string) ?? null,
    toOfficerId: (r.to_officer_id as string) ?? null,
    note: r.note as string,
  };
}

function mapAttachment(r: Record<string, unknown>): Attachment {
  return {
    id: r.id as string,
    letterId: r.letter_id as string,
    kind: r.kind as Attachment['kind'],
    storageKey: r.storage_key as string,
    fileName: r.file_name as string,
    mimeType: r.mime_type as string,
    size: r.size as number,
    uploadedByUserId: (r.uploaded_by_user_id as string) ?? null,
    uploadedAt: r.uploaded_at as number,
  };
}

function mapNotification(r: Record<string, unknown>): NotificationRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    letterId: (r.letter_id as string) ?? null,
    type: r.type as NotificationRow['type'],
    message: r.message as string,
    createdAt: r.created_at as number,
    readAt: (r.read_at as number) ?? null,
  };
}

function mapNotificationLog(r: Record<string, unknown>): NotificationLogRow {
  return {
    id: r.id as string,
    channel: r.channel as NotificationLogRow['channel'],
    recipient: r.recipient as string,
    subject: (r.subject as string) ?? null,
    body: r.body as string,
    status: r.status as string,
    letterId: (r.letter_id as string) ?? null,
    createdAt: r.created_at as number,
  };
}

function mapMailbox(r: Record<string, unknown>): Mailbox {
  return {
    id: r.id as string,
    officeId: r.office_id as string,
    provider: r.provider as string,
    address: r.address as string,
    isActive: !!r.is_active,
    createdAt: r.created_at as number,
  };
}

// ---------- identity / bootstrap ----------

// Only the server-verified fixed account can bind a correspondence identity.
export async function resolveCurrentUser(db: D1Database, identity: PlatformIdentity): Promise<CorrUser> {
  const account = accountForEmail(identity.email);
  if (!account || identity.externalId !== 'wpitrda:' + account.email) throw new Error('Forbidden: unknown account.');
  const existing = await db.prepare('SELECT * FROM corr_users WHERE lower(email)=?').bind(account.email).first<Record<string, unknown>>();
  if (existing) {
    if (!existing.is_active || existing.role !== account.corrRole) throw new Error('Forbidden: account inactive or role assignment invalid.');
    return mapUser(existing);
  }
  const now = Date.now();
  await db.prepare('INSERT OR IGNORE INTO corr_offices (id,name,is_active,created_at,updated_at) VALUES (?,?,?,?,?)').bind('COL','Colombo office',1,now,now).run();
  await db.prepare('INSERT OR IGNORE INTO corr_users (id,external_id,email,display_name,phone,role,office_id,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind('wpitrda:' + account.email,identity.externalId,account.email,account.label,null,account.corrRole,account.role === 'super_authority' ? null : 'COL',1,now).run();
  const row = await db.prepare('SELECT * FROM corr_users WHERE id=?').bind('wpitrda:' + account.email).first<Record<string, unknown>>();
  if (!row || row.role !== account.corrRole || !row.is_active) throw new Error('Forbidden: account unavailable.');
  return mapUser(row);
}

// ---------- offices (Admin only) ----------

export async function listOffices(db: D1Database): Promise<Office[]> {
  const { results } = await db.prepare('SELECT * FROM corr_offices ORDER BY name ASC').all<Record<string, unknown>>();
  return (results ?? []).map(mapOffice);
}

export async function createOffice(db: D1Database, actor: CorrUser, name: string): Promise<Office> {
  requireRole(actor.role, ['admin']);
  const clean = text(name, 200);
  if (!clean) throw new Error('Office name is required.');
  const now = Date.now();
  const row = { id: uid(), name: clean, is_active: 1, created_at: now, updated_at: now };
  await db
    .prepare('INSERT INTO corr_offices (id,name,is_active,created_at,updated_at) VALUES (?,?,?,?,?)')
    .bind(row.id, row.name, row.is_active, row.created_at, row.updated_at)
    .run();
  return mapOffice(row);
}

export async function renameOffice(db: D1Database, actor: CorrUser, officeId: string, name: string): Promise<void> {
  requireRole(actor.role, ['admin']);
  const clean = text(name, 200);
  if (!clean) throw new Error('Office name is required.');
  await db.prepare('UPDATE corr_offices SET name = ?, updated_at = ? WHERE id = ?').bind(clean, Date.now(), officeId).run();
}

export async function setOfficeActive(db: D1Database, actor: CorrUser, officeId: string, isActive: boolean): Promise<void> {
  requireRole(actor.role, ['admin']);
  await db
    .prepare('UPDATE corr_offices SET is_active = ?, updated_at = ? WHERE id = ?')
    .bind(isActive ? 1 : 0, Date.now(), officeId)
    .run();
}

// ---------- users (Admin onboards; HOD can see their own office's roster) ----------

export async function listUsers(db: D1Database, actor: CorrUser): Promise<CorrUser[]> {
  if (actor.role === 'admin') {
    const { results } = await db.prepare('SELECT * FROM corr_users ORDER BY display_name ASC').all<Record<string, unknown>>();
    return (results ?? []).map(mapUser);
  }
  if (actor.role === 'hod' && actor.officeId) {
    const { results } = await db
      .prepare('SELECT * FROM corr_users WHERE office_id = ? ORDER BY display_name ASC')
      .bind(actor.officeId)
      .all<Record<string, unknown>>();
    return (results ?? []).map(mapUser);
  }
  return [actor];
}

export async function onboardUser(
  db: D1Database,
  actor: CorrUser,
  input: { email: string; displayName: string; phone?: string | null; role: Role; officeId?: string | null },
): Promise<CorrUser> {
  requireRole(actor.role, ['admin']);
  const email = text(input.email, 320).toLowerCase();
  const displayName = text(input.displayName, 200);
  if (!email || !email.includes('@')) throw new Error('A valid email address is required.');
  if (!displayName) throw new Error('A display name is required.');
  if (!['admin', 'peon', 'hod', 'officer'].includes(input.role)) throw new Error('Invalid role.');
  const officeId = input.role === 'admin' ? null : (input.officeId ?? null);
  if (input.role !== 'admin' && !officeId) throw new Error(`${ROLE_LABEL[input.role]} accounts must belong to an office.`);
  if (officeId) {
    const office = await db.prepare('SELECT id FROM corr_offices WHERE id = ? AND is_active = 1').bind(officeId).first();
    if (!office) throw new Error('Select an active office.');
  }
  const existing = await db.prepare('SELECT id FROM corr_users WHERE lower(email) = ?').bind(email).first();
  if (existing) throw new Error('Someone with that email is already onboarded.');
  const row = {
    id: uid(),
    external_id: null as string | null,
    email,
    display_name: displayName,
    phone: input.phone ? text(input.phone, 40) : null,
    role: input.role,
    office_id: officeId,
    is_active: 1,
    created_at: Date.now(),
  };
  await db
    .prepare(
      'INSERT INTO corr_users (id,external_id,email,display_name,phone,role,office_id,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .bind(row.id, row.external_id, row.email, row.display_name, row.phone, row.role, row.office_id, row.is_active, row.created_at)
    .run();
  return mapUser(row);
}

export async function updateUser(
  db: D1Database,
  actor: CorrUser,
  userId: string,
  patch: { displayName?: string; phone?: string | null; role?: Role; officeId?: string | null; isActive?: boolean },
): Promise<void> {
  requireRole(actor.role, ['admin']);
  const current = await db.prepare('SELECT * FROM corr_users WHERE id = ?').bind(userId).first<Record<string, unknown>>();
  if (!current) throw new Error('That account does not exist.');
  const role = patch.role ?? (current.role as Role);
  const fixed = accountForEmail(String(current.email));
  if (fixed && role !== fixed.corrRole) throw new Error('Forbidden: this account has a fixed role.');
  const officeId = role === 'admin' ? null : (patch.officeId !== undefined ? patch.officeId : (current.office_id as string | null));
  if (role !== 'admin' && !officeId) throw new Error(`${ROLE_LABEL[role]} accounts must belong to an office.`);
  await db
    .prepare('UPDATE corr_users SET display_name = ?, phone = ?, role = ?, office_id = ?, is_active = ? WHERE id = ?')
    .bind(
      patch.displayName !== undefined ? text(patch.displayName, 200) : current.display_name,
      patch.phone !== undefined ? (patch.phone ? text(patch.phone, 40) : null) : current.phone,
      role,
      officeId,
      patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : current.is_active,
      userId,
    )
    .run();
}

// ---------- letters ----------

async function countTodayByPrefix(db: D1Database, prefix: string): Promise<number> {
  const { count } = (await db
    .prepare("SELECT COUNT(*) as count FROM corr_letters WHERE reference_number LIKE ?")
    .bind(prefix + '%')
    .first<{ count: number }>()) ?? { count: 0 };
  return count;
}

// Reference numbers are generated from a COUNT of today's rows rather than a real sequence.
// Under low concurrency (the expected case for a single office's intake clerk) this is safe in
// practice; under simultaneous registrations it could in principle hand out the same number
// twice. Accepted risk, documented here rather than solved with a dedicated counter table.
async function nextReferenceNumber(db: D1Database, prefix: string): Promise<string> {
  const n = (await countTodayByPrefix(db, prefix + '-' + dateCode())) + 1;
  return `${prefix}-${dateCode()}-${String(n).padStart(4, '0')}`;
}

async function logMovement(
  db: D1Database,
  letterId: string,
  actor: CorrUser,
  type: string,
  note: string,
  extra?: Partial<{ fromOfficeId: string | null; toOfficeId: string | null; fromOfficerId: string | null; toOfficerId: string | null }>,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO corr_letter_movements (id,letter_id,at,actor_user_id,actor_name,actor_role,type,from_office_id,to_office_id,from_officer_id,to_officer_id,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      uid(),
      letterId,
      Date.now(),
      actor.id,
      actor.displayName,
      actor.role,
      type,
      extra?.fromOfficeId ?? null,
      extra?.toOfficeId ?? null,
      extra?.fromOfficerId ?? null,
      extra?.toOfficerId ?? null,
      note,
    )
    .run();
}

async function getLetterRow(db: D1Database, letterId: string): Promise<Record<string, unknown>> {
  const row = await db.prepare('SELECT * FROM corr_letters WHERE id = ?').bind(letterId).first<Record<string, unknown>>();
  if (!row) throw new Error('That letter does not exist.');
  return row;
}

function canSeeLetter(actor: CorrUser, letter: Letter): boolean {
  if (actor.role === 'peon' || actor.role === 'hod') return letter.officeId === actor.officeId;
  if (actor.role === 'officer') return letter.assignedOfficerId === actor.id;
  return false; // admin has no operational visibility into letter content by default
}

// Peon/admin registers an ordinary incoming letter for their own office: records the physical
// register/book reference, the sender, and (optionally) the scan attachment. The Peon does not
// choose the responsible officer — the letter simply becomes visible to their office's HOD.
export async function registerLetter(
  db: D1Database,
  actor: CorrUser,
  input: {
    subject: string;
    senderName: string;
    senderContact?: string | null;
    receivedAt?: number | null;
    originalLocationNote?: string | null;
    referenceNumber?: string | null; // override the auto-generated register/book reference if the physical book already assigns one
    scan?: { key: string; fileName: string; mimeType: string; size: number } | null;
  },
): Promise<Letter> {
  requireRole(actor.role, ['peon']);
  if (!actor.officeId) throw new Error('Your account has no office assigned.');
  const subject = text(input.subject, 500);
  const senderName = text(input.senderName, 300);
  if (!subject) throw new Error('Subject is required.');
  if (!senderName) throw new Error('Sender is required.');
  const now = Date.now();
  const referenceNumber = input.referenceNumber ? text(input.referenceNumber, 60) : await nextReferenceNumber(db, 'REG');
  const row = {
    id: uid(),
    reference_number: referenceNumber,
    source: 'physical' as const,
    subject,
    sender_name: senderName,
    sender_contact: input.senderContact ? text(input.senderContact, 300) : null,
    received_at: input.receivedAt ?? now,
    registered_at: now,
    registered_by_user_id: actor.id,
    original_location_note: input.originalLocationNote ? text(input.originalLocationNote, 300) : null,
    office_id: actor.officeId,
    assigned_officer_id: null as string | null,
    status: 'registered' as LetterStatus,
    forward_to_office_id: null as string | null,
    forward_authorised_by_user_id: null as string | null,
    forward_authorised_at: null as number | null,
    last_return_reason: null as string | null,
    last_return_at: null as number | null,
    outcome_text: null as string | null,
    outcome_recorded_at: null as number | null,
    outcome_recorded_by_user_id: null as string | null,
    last_correction_at: null as number | null,
  };
  await db
    .prepare(
      `INSERT INTO corr_letters
        (id,reference_number,source,subject,sender_name,sender_contact,received_at,registered_at,registered_by_user_id,original_location_note,office_id,assigned_officer_id,status,forward_to_office_id,forward_authorised_by_user_id,forward_authorised_at,last_return_reason,last_return_at,outcome_text,outcome_recorded_at,outcome_recorded_by_user_id,last_correction_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.reference_number, row.source, row.subject, row.sender_name, row.sender_contact,
      row.received_at, row.registered_at, row.registered_by_user_id, row.original_location_note,
      row.office_id, row.assigned_officer_id, row.status, row.forward_to_office_id,
      row.forward_authorised_by_user_id, row.forward_authorised_at, row.last_return_reason,
      row.last_return_at, row.outcome_text, row.outcome_recorded_at, row.outcome_recorded_by_user_id,
      row.last_correction_at,
    )
    .run();
  const letter = mapLetter(row);
  await logMovement(db, letter.id, actor, 'registered', `Registered (${referenceNumber}).`, { toOfficeId: actor.officeId });
  if (input.scan) {
    await recordAttachment(db, {
      letterId: letter.id,
      kind: 'scan',
      storageKey: input.scan.key,
      fileName: input.scan.fileName,
      mimeType: input.scan.mimeType,
      size: input.scan.size,
      uploadedByUserId: actor.id,
    });
  }
  return letter;
}

export async function listLetters(
  db: D1Database,
  actor: CorrUser,
  filters?: { status?: LetterStatus; search?: string },
): Promise<Letter[]> {
  let sql: string;
  const binds: unknown[] = [];
  if (actor.role === 'peon' || actor.role === 'hod') {
    if (!actor.officeId) return [];
    sql = 'SELECT * FROM corr_letters WHERE office_id = ?';
    binds.push(actor.officeId);
  } else if (actor.role === 'officer') {
    sql = 'SELECT * FROM corr_letters WHERE assigned_officer_id = ?';
    binds.push(actor.id);
  } else {
    return []; // admin: no operational letter visibility by default
  }
  if (filters?.status) {
    sql += ' AND status = ?';
    binds.push(filters.status);
  }
  if (filters?.search) {
    sql += ' AND (subject LIKE ? OR sender_name LIKE ? OR reference_number LIKE ?)';
    const like = `%${filters.search}%`;
    binds.push(like, like, like);
  }
  sql += ' ORDER BY registered_at DESC LIMIT 500';
  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return (results ?? []).map(mapLetter);
}

export async function getLetterDetail(
  db: D1Database,
  actor: CorrUser,
  letterId: string,
): Promise<{ letter: Letter; movements: Movement[]; attachments: Attachment[] }> {
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (!canSeeLetter(actor, letter)) throw new Error('You do not have access to that letter.');
  return { letter, movements: await listMovements(db, letterId), attachments: await listAttachments(db, letterId) };
}

export async function listMovements(db: D1Database, letterId: string): Promise<Movement[]> {
  const { results } = await db
    .prepare('SELECT * FROM corr_letter_movements WHERE letter_id = ? ORDER BY at ASC')
    .bind(letterId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapMovement);
}

// HOD reviews a newly registered (or returned) letter and assigns it to an officer in their office.
export async function assignLetter(
  db: D1Database,
  actor: CorrUser,
  letterId: string,
  officerId: string,
  instructions?: string | null,
): Promise<void> {
  requireRole(actor.role, ['hod']);
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
  if (!['registered', 'returned_to_hod'].includes(letter.status)) throw new Error('That letter cannot be assigned from its current status.');
  const officer = await db.prepare('SELECT * FROM corr_users WHERE id = ? AND role = ? AND office_id = ? AND is_active = 1').bind(officerId, 'officer', actor.officeId).first<Record<string, unknown>>();
  if (!officer) throw new Error('Select an active officer in your office.');
  await db.prepare('UPDATE corr_letters SET assigned_officer_id = ?, status = ? WHERE id = ?').bind(officerId, 'assigned', letterId).run();
  const note = instructions ? text(instructions, 1000) : 'Assigned.';
  await logMovement(db, letterId, actor, 'assigned', note, { toOfficerId: officerId });
  await notifyAssignment(db, mapUser(officer), { ...letter, assignedOfficerId: officerId, status: 'assigned' });
}

// HOD authorises forwarding the letter to another office. Peon/admin then records the physical
// handover once the original has actually been carried over.
export async function authoriseForward(
  db: D1Database,
  actor: CorrUser,
  letterId: string,
  targetOfficeId: string,
  note?: string | null,
): Promise<void> {
  requireRole(actor.role, ['hod']);
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
  if (!['registered', 'returned_to_hod'].includes(letter.status)) throw new Error('That letter cannot be forwarded from its current status.');
  if (targetOfficeId === actor.officeId) throw new Error('Choose a different office to forward to.');
  const target = await db.prepare('SELECT * FROM corr_offices WHERE id = ? AND is_active = 1').bind(targetOfficeId).first();
  if (!target) throw new Error('Select an active destination office.');
  await db
    .prepare('UPDATE corr_letters SET status = ?, forward_to_office_id = ?, forward_authorised_by_user_id = ?, forward_authorised_at = ?, assigned_officer_id = NULL WHERE id = ?')
    .bind('forward_pending', targetOfficeId, actor.id, Date.now(), letterId)
    .run();
  await logMovement(db, letterId, actor, 'forward_authorised', note ? text(note, 1000) : 'Forwarding authorised.', {
    fromOfficeId: actor.officeId,
    toOfficeId: targetOfficeId,
  });
  const { results: peons } = await db.prepare('SELECT * FROM corr_users WHERE office_id = ? AND role = ? AND is_active = 1').bind(actor.officeId, 'peon').all<Record<string, unknown>>();
  for (const p of peons ?? []) {
    const peon = mapUser(p);
    const message = `Forwarding authorised: ${letter.referenceNumber} — ${letter.subject}. Record the physical handover when the original leaves.`;
    await notifyInApp(db, peon.id, 'forward_authorised', message, letterId);
    await sendEmail(db, peon.email, 'Forwarding authorised: ' + letter.referenceNumber, message, letterId);
    await sendSms(db, peon.phone, message, letterId);
  }
}

// Peon/admin records that the physical original has actually been carried to the new office.
export async function recordPhysicalForward(db: D1Database, actor: CorrUser, letterId: string): Promise<void> {
  requireRole(actor.role, ['peon']);
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
  if (letter.status !== 'forward_pending' || !letter.forwardToOfficeId) throw new Error('That letter has no forwarding authorised.');
  const toOfficeId = letter.forwardToOfficeId;
  await db
    .prepare('UPDATE corr_letters SET office_id = ?, status = ?, forward_to_office_id = NULL, forward_authorised_by_user_id = NULL, forward_authorised_at = NULL, assigned_officer_id = NULL WHERE id = ?')
    .bind(toOfficeId, 'registered', letterId)
    .run();
  await logMovement(db, letterId, actor, 'forwarded', 'Physical handover recorded.', { fromOfficeId: actor.officeId, toOfficeId });
  const { results: hods } = await db.prepare('SELECT * FROM corr_users WHERE office_id = ? AND role = ? AND is_active = 1').bind(toOfficeId, 'hod').all<Record<string, unknown>>();
  for (const h of hods ?? []) {
    const hod = mapUser(h);
    const message = `Letter arrived: ${letter.referenceNumber} — ${letter.subject}. Awaiting your review.`;
    await notifyInApp(db, hod.id, 'assignment', message, letterId);
  }
}

// Officer accepts a letter assigned to them.
export async function acceptLetter(db: D1Database, actor: CorrUser, letterId: string): Promise<void> {
  requireRole(actor.role, ['officer']);
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.assignedOfficerId !== actor.id) throw new Error('That letter is not assigned to you.');
  if (letter.status !== 'assigned') throw new Error('That letter cannot be accepted from its current status.');
  await db.prepare('UPDATE corr_letters SET status = ? WHERE id = ?').bind('in_progress', letterId).run();
  await logMovement(db, letterId, actor, 'accepted', 'Accepted.');
}

// Officer returns an incorrect assignment to the HOD with a reason.
export async function returnLetter(db: D1Database, actor: CorrUser, letterId: string, reason: string): Promise<void> {
  requireRole(actor.role, ['officer']);
  const cleanReason = text(reason, 1000);
  if (!cleanReason) throw new Error('A reason is required to return an assignment.');
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.assignedOfficerId !== actor.id) throw new Error('That letter is not assigned to you.');
  if (!['assigned', 'in_progress'].includes(letter.status)) throw new Error('That letter cannot be returned from its current status.');
  await db
    .prepare('UPDATE corr_letters SET status = ?, last_return_reason = ?, last_return_at = ? WHERE id = ?')
    .bind('returned_to_hod', cleanReason, Date.now(), letterId)
    .run();
  await logMovement(db, letterId, actor, 'returned', cleanReason, { fromOfficerId: actor.id });
  const { results: hods } = await db.prepare('SELECT * FROM corr_users WHERE office_id = ? AND role = ? AND is_active = 1').bind(actor.officeId, 'hod').all<Record<string, unknown>>();
  for (const h of hods ?? []) {
    const hod = mapUser(h);
    const message = `Assignment returned: ${letter.referenceNumber} — ${letter.subject}. Reason: ${cleanReason}`;
    await notifyInApp(db, hod.id, 'returned', message, letterId);
    await sendEmail(db, hod.email, 'Assignment returned: ' + letter.referenceNumber, message, letterId);
  }
}

// HOD reassigns a letter (returned, or simply misassigned) to a different officer, with a reason.
export async function reassignLetter(
  db: D1Database,
  actor: CorrUser,
  letterId: string,
  officerId: string,
  reason: string,
): Promise<void> {
  requireRole(actor.role, ['hod']);
  const cleanReason = text(reason, 1000);
  if (!cleanReason) throw new Error('A reason is required to reassign a letter.');
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
  if (!['assigned', 'in_progress', 'returned_to_hod'].includes(letter.status)) throw new Error('That letter cannot be reassigned from its current status.');
  const officer = await db.prepare('SELECT * FROM corr_users WHERE id = ? AND role = ? AND office_id = ? AND is_active = 1').bind(officerId, 'officer', actor.officeId).first<Record<string, unknown>>();
  if (!officer) throw new Error('Select an active officer in your office.');
  const fromOfficerId = letter.assignedOfficerId;
  await db.prepare('UPDATE corr_letters SET assigned_officer_id = ?, status = ? WHERE id = ?').bind(officerId, 'assigned', letterId).run();
  await logMovement(db, letterId, actor, 'reassigned', cleanReason, { fromOfficerId, toOfficerId: officerId });
  await notifyAssignment(db, mapUser(officer), { ...letter, assignedOfficerId: officerId, status: 'assigned' }, true);
}

// Officer records the work performed and its outcome. This completes the letter — there is no
// separate closure step.
export async function recordOutcome(db: D1Database, actor: CorrUser, letterId: string, outcomeText: string): Promise<void> {
  requireRole(actor.role, ['officer']);
  const clean = text(outcomeText, 4000);
  if (!clean) throw new Error('Describe the work performed and its outcome.');
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.assignedOfficerId !== actor.id) throw new Error('That letter is not assigned to you.');
  if (letter.status !== 'in_progress') throw new Error('Accept the letter before recording an outcome.');
  await db
    .prepare('UPDATE corr_letters SET status = ?, outcome_text = ?, outcome_recorded_at = ?, outcome_recorded_by_user_id = ? WHERE id = ?')
    .bind('done', clean, Date.now(), actor.id, letterId)
    .run();
  await logMovement(db, letterId, actor, 'outcome_recorded', clean);
}

// Peon/admin corrects an entry mistake (subject, sender, register reference, original location)
// through a recorded correction rather than a silent edit. Never deletes a letter or its history.
export async function correctLetterEntry(
  db: D1Database,
  actor: CorrUser,
  letterId: string,
  patch: { subject?: string; senderName?: string; senderContact?: string | null; referenceNumber?: string; originalLocationNote?: string | null },
  reason: string,
): Promise<void> {
  requireRole(actor.role, ['peon']);
  const cleanReason = text(reason, 1000);
  if (!cleanReason) throw new Error('A reason is required to correct an entry.');
  const letter = mapLetter(await getLetterRow(db, letterId));
  if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
  const next = {
    subject: patch.subject !== undefined ? text(patch.subject, 500) || letter.subject : letter.subject,
    sender_name: patch.senderName !== undefined ? text(patch.senderName, 300) || letter.senderName : letter.senderName,
    sender_contact: patch.senderContact !== undefined ? (patch.senderContact ? text(patch.senderContact, 300) : null) : letter.senderContact,
    reference_number: patch.referenceNumber !== undefined ? text(patch.referenceNumber, 60) || letter.referenceNumber : letter.referenceNumber,
    original_location_note:
      patch.originalLocationNote !== undefined ? (patch.originalLocationNote ? text(patch.originalLocationNote, 300) : null) : letter.originalLocationNote,
  };
  await db
    .prepare('UPDATE corr_letters SET subject = ?, sender_name = ?, sender_contact = ?, reference_number = ?, original_location_note = ?, last_correction_at = ? WHERE id = ?')
    .bind(next.subject, next.sender_name, next.sender_contact, next.reference_number, next.original_location_note, Date.now(), letterId)
    .run();
  await logMovement(db, letterId, actor, 'corrected', cleanReason);
}

// ---------- attachments ----------

export async function listAttachments(db: D1Database, letterId: string): Promise<Attachment[]> {
  const { results } = await db
    .prepare('SELECT * FROM corr_letter_attachments WHERE letter_id = ? ORDER BY uploaded_at ASC')
    .bind(letterId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapAttachment);
}

export async function recordAttachment(
  db: D1Database,
  input: { letterId: string; kind: Attachment['kind']; storageKey: string; fileName: string; mimeType: string; size: number; uploadedByUserId: string },
): Promise<Attachment> {
  const row = {
    id: uid(),
    letter_id: input.letterId,
    kind: input.kind,
    storage_key: input.storageKey,
    file_name: text(input.fileName, 300) || 'attachment',
    mime_type: input.mimeType,
    size: input.size,
    uploaded_by_user_id: input.uploadedByUserId,
    uploaded_at: Date.now(),
  };
  await db
    .prepare('INSERT INTO corr_letter_attachments (id,letter_id,kind,storage_key,file_name,mime_type,size,uploaded_by_user_id,uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(row.id, row.letter_id, row.kind, row.storage_key, row.file_name, row.mime_type, row.size, row.uploaded_by_user_id, row.uploaded_at)
    .run();
  return mapAttachment(row);
}

// `letterId` is optional for a 'scan' upload because Peon/admin requests the presigned URL
// before the letter row exists yet (the scan is attached during registration itself).
export async function authorizeAttachmentUpload(
  db: D1Database,
  actor: CorrUser,
  input: { letterId?: string | null; kind: Attachment['kind'] },
): Promise<void> {
  if (input.kind === 'scan') {
    requireRole(actor.role, ['peon']);
    if (input.letterId) {
      const letter = mapLetter(await getLetterRow(db, input.letterId));
      if (letter.officeId !== actor.officeId) throw new Error('That letter is not in your office.');
    }
    return;
  }
  requireRole(actor.role, ['officer']);
  if (!input.letterId) throw new Error('Choose a letter first.');
  const letter = mapLetter(await getLetterRow(db, input.letterId));
  if (letter.assignedOfficerId !== actor.id) throw new Error('That letter is not assigned to you.');
  if (!['assigned', 'in_progress'].includes(letter.status)) throw new Error('That letter cannot take new attachments from its current status.');
}

async function getAttachmentRow(db: D1Database, attachmentId: string): Promise<Record<string, unknown>> {
  const row = await db.prepare('SELECT * FROM corr_letter_attachments WHERE id = ?').bind(attachmentId).first<Record<string, unknown>>();
  if (!row) throw new Error('That attachment does not exist.');
  return row;
}

export async function authorizeAttachmentDownload(db: D1Database, actor: CorrUser, attachmentId: string): Promise<Attachment> {
  const attachment = mapAttachment(await getAttachmentRow(db, attachmentId));
  const letter = mapLetter(await getLetterRow(db, attachment.letterId));
  if (!canSeeLetter(actor, letter)) throw new Error('You do not have access to that letter.');
  return attachment;
}

// ---------- notifications ----------

async function notifyAssignment(db: D1Database, officer: CorrUser, letter: Letter, isReassignment = false): Promise<void> {
  const message = `${isReassignment ? 'Reassigned' : 'New assignment'}: ${letter.referenceNumber} — ${letter.subject}`;
  await notifyInApp(db, officer.id, isReassignment ? 'reassignment' : 'assignment', message, letter.id);
  await sendEmail(db, officer.email, message, `You have been ${isReassignment ? 'reassigned' : 'assigned'} letter ${letter.referenceNumber}: ${letter.subject}.`, letter.id);
  await sendSms(db, officer.phone, message, letter.id);
}

export async function listNotifications(db: D1Database, userId: string): Promise<NotificationRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM corr_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
    .bind(userId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapNotification);
}

export async function markNotificationRead(db: D1Database, userId: string, notificationId: string): Promise<void> {
  await db.prepare('UPDATE corr_notifications SET read_at = ? WHERE id = ? AND user_id = ?').bind(Date.now(), notificationId, userId).run();
}

export async function listNotificationLog(db: D1Database, actor: CorrUser): Promise<NotificationLogRow[]> {
  requireRole(actor.role, ['admin']);
  const { results } = await db.prepare('SELECT * FROM corr_notification_log ORDER BY created_at DESC LIMIT 300').all<Record<string, unknown>>();
  return (results ?? []).map(mapNotificationLog);
}

// ---------- mailboxes / email intake (per-office) ----------

export async function listMailboxes(db: D1Database, actor: CorrUser): Promise<Mailbox[]> {
  if (actor.role === 'admin') {
    const { results } = await db.prepare('SELECT * FROM corr_mailboxes ORDER BY created_at DESC').all<Record<string, unknown>>();
    return (results ?? []).map(mapMailbox);
  }
  if (actor.role === 'peon' && actor.officeId) {
    const { results } = await db.prepare('SELECT * FROM corr_mailboxes WHERE office_id = ? ORDER BY created_at DESC').bind(actor.officeId).all<Record<string, unknown>>();
    return (results ?? []).map(mapMailbox);
  }
  return [];
}

export async function upsertMailbox(
  db: D1Database,
  actor: CorrUser,
  input: { id?: string; officeId: string; provider: string; address: string; isActive?: boolean },
): Promise<Mailbox> {
  requireRole(actor.role, ['admin']);
  const office = await db.prepare('SELECT id FROM corr_offices WHERE id = ?').bind(input.officeId).first();
  if (!office) throw new Error('Select a valid office.');
  const provider = text(input.provider, 100) || 'mock';
  const address = text(input.address, 300);
  if (!address) throw new Error('Mailbox address is required.');
  if (input.id) {
    await db
      .prepare('UPDATE corr_mailboxes SET office_id = ?, provider = ?, address = ?, is_active = ? WHERE id = ?')
      .bind(input.officeId, provider, address, input.isActive === false ? 0 : 1, input.id)
      .run();
    return mapMailbox({ id: input.id, office_id: input.officeId, provider, address, is_active: input.isActive === false ? 0 : 1, created_at: Date.now() });
  }
  const row = { id: uid(), office_id: input.officeId, provider, address, is_active: 1, created_at: Date.now() };
  await db
    .prepare('INSERT INTO corr_mailboxes (id,office_id,provider,address,is_active,created_at) VALUES (?,?,?,?,?,?)')
    .bind(row.id, row.office_id, row.provider, row.address, row.is_active, row.created_at)
    .run();
  return mapMailbox(row);
}

// Dev tool standing in for the real provider webhook: queues a fake inbound email.
export async function mockIncomingEmail(
  db: D1Database,
  actor: CorrUser,
  input: { mailboxId: string; fromAddress: string; subject: string; body: string },
): Promise<void> {
  requireRole(actor.role, ['peon', 'admin']);
  const mailbox = await db.prepare('SELECT * FROM corr_mailboxes WHERE id = ?').bind(input.mailboxId).first<Record<string, unknown>>();
  if (!mailbox) throw new Error('That mailbox does not exist.');
  if (actor.role === 'peon' && mailbox.office_id !== actor.officeId) throw new Error('That mailbox belongs to a different office.');
  await db
    .prepare('INSERT INTO corr_mock_inbox (id,mailbox_id,from_address,subject,body,received_at,processed) VALUES (?,?,?,?,?,?,0)')
    .bind(uid(), input.mailboxId, text(input.fromAddress, 300) || 'unknown@example.com', text(input.subject, 500) || '(no subject)', text(input.body, 4000), Date.now())
    .run();
}

// Turns queued mock inbound emails into registered letters, scoped to the actor's office (Admin
// processes every office's queue).
export async function runEmailIntake(db: D1Database, actor: CorrUser): Promise<number> {
  requireRole(actor.role, ['peon', 'admin']);
  let sql = `SELECT i.*, m.office_id as mailbox_office_id FROM corr_mock_inbox i JOIN corr_mailboxes m ON m.id = i.mailbox_id WHERE i.processed = 0`;
  const binds: unknown[] = [];
  if (actor.role === 'peon') {
    sql += ' AND m.office_id = ?';
    binds.push(actor.officeId);
  }
  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  let created = 0;
  for (const row of results ?? []) {
    const officeId = row.mailbox_office_id as string;
    const now = Date.now();
    const referenceNumber = await nextReferenceNumber(db, 'EML');
    const letterRow = {
      id: uid(),
      reference_number: referenceNumber,
      source: 'email' as const,
      subject: row.subject as string,
      sender_name: row.from_address as string,
      sender_contact: row.from_address as string,
      received_at: row.received_at as number,
      registered_at: now,
      registered_by_user_id: null as string | null,
      original_location_note: null as string | null,
      office_id: officeId,
      assigned_officer_id: null as string | null,
      status: 'registered' as LetterStatus,
      forward_to_office_id: null as string | null,
      forward_authorised_by_user_id: null as string | null,
      forward_authorised_at: null as number | null,
      last_return_reason: null as string | null,
      last_return_at: null as number | null,
      outcome_text: null as string | null,
      outcome_recorded_at: null as number | null,
      outcome_recorded_by_user_id: null as string | null,
      last_correction_at: null as number | null,
    };
    await db
      .prepare(
        `INSERT INTO corr_letters
          (id,reference_number,source,subject,sender_name,sender_contact,received_at,registered_at,registered_by_user_id,original_location_note,office_id,assigned_officer_id,status,forward_to_office_id,forward_authorised_by_user_id,forward_authorised_at,last_return_reason,last_return_at,outcome_text,outcome_recorded_at,outcome_recorded_by_user_id,last_correction_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        letterRow.id, letterRow.reference_number, letterRow.source, letterRow.subject, letterRow.sender_name, letterRow.sender_contact,
        letterRow.received_at, letterRow.registered_at, letterRow.registered_by_user_id, letterRow.original_location_note,
        letterRow.office_id, letterRow.assigned_officer_id, letterRow.status, letterRow.forward_to_office_id,
        letterRow.forward_authorised_by_user_id, letterRow.forward_authorised_at, letterRow.last_return_reason,
        letterRow.last_return_at, letterRow.outcome_text, letterRow.outcome_recorded_at, letterRow.outcome_recorded_by_user_id,
        letterRow.last_correction_at,
      )
      .run();
    await db.prepare('UPDATE corr_mock_inbox SET processed = 1 WHERE id = ?').bind(row.id).run();
    const fakeActor: CorrUser = { id: 'system', externalId: null, email: 'system', displayName: 'Email intake', phone: null, role: 'peon', officeId, isActive: true, createdAt: now };
    await logMovement(db, letterRow.id, fakeActor, 'registered', `Received by email (${referenceNumber}).`, { toOfficeId: officeId });
    created += 1;
  }
  return created;
}
