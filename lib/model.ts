export type Role = 'Government' | 'HOD' | 'Peon' | 'Officer';
export type Permission =
  | 'correspondence.view_all' | 'correspondence.view_office' | 'correspondence.view_assigned'
  | 'correspondence.register' | 'correspondence.record_handover' | 'correspondence.assign'
  | 'correspondence.reassign_hod' | 'correspondence.forward' | 'correspondence.record_action'
  | 'correspondence.record_secret_contents' | 'correspondence.view_secret_contents' | 'accounts.manage';

// These Django-style Groups and codenamed permissions are enforced on the server.
// A Person has one role, which maps to one Group.
export const DJANGO_GROUP_PERMISSIONS: Record<Role, Permission[]> = {
  Government: ['correspondence.view_all', 'correspondence.view_secret_contents', 'accounts.manage'],
  Peon: ['correspondence.view_office', 'correspondence.register', 'correspondence.record_handover'],
  HOD: ['correspondence.view_office', 'correspondence.assign', 'correspondence.reassign_hod', 'correspondence.forward', 'correspondence.record_action', 'correspondence.record_secret_contents', 'correspondence.view_secret_contents'],
  Officer: ['correspondence.view_assigned', 'correspondence.record_action'],
};

export type Person = { id: string; name: string; role: Role; office: string; active: boolean; subject?: string; accountEmail?: string; accountId?: string };
export type Event = { at: string; actor: string; role: string; text: string; actorId?: string; changes?: Record<string, { before: string; after: string }> };
export type ReplyDispatch = { status: 'Awaiting dispatch' | 'Dispatched'; recipient: string; address: string; note: string; readyAt: string; readyBy: string; dispatchedAt?: string; dispatchedBy?: string; dispatchNote?: string };
export type Letter = { id: string; ref: string; office: string; subject: string; sender: string; received: string; entered: string; method: string; condition: string; language: string; secret: boolean; hod: string; officer: string; instructions: string; delivery: string; action: string; outcome: string; history: Event[]; views: number; file?: string; fileName?: string; fileType?: string; restrictedText?: string; destination?: string; intended?: string; origin?: string; previousRefs?: string[]; replyTo?: string; sample?: boolean; department?: string; issue?: string; registeredBy?: string; registeredOffice?: string; handledOffices?: string[]; assignedAt?: string; physicalReceivedDate?: string; actionAt?: string; replyDispatch?: ReplyDispatch };
export type State = { people: Person[]; letters: Letter[]; counters: Record<string, number>; administratorUserId?: string; administratorEmail?: string };
export type AuthenticatedUser = { userId: string; email: string; displayName: string };

export const offices = ['COL', 'KOT', 'MAH'];
export const officeName: Record<string, string> = { COL: 'Colombo office', KOT: 'Kotte office', MAH: 'Maharagama office', ALL: 'All offices' };
export const dateCode = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replaceAll('-', '');
export function reference(s: State, office: string) { const key = office + '-' + dateCode(); s.counters[key] = (s.counters[key] || 0) + 1; return key + '-' + String(s.counters[key]).padStart(4, '0'); }
export const hasPermission = (person: Person, permission: Permission) => DJANGO_GROUP_PERMISSIONS[person.role].includes(permission);

export function seed(user?: AuthenticatedUser): State {
  const s: State = { people: [{ id: 'gov', name: user?.displayName || 'Government administrator', role: 'Government', office: 'ALL', active: true, accountEmail: user?.email, accountId: user?.userId }], letters: [], counters: {}, administratorUserId: user?.userId, administratorEmail: user?.email };
  for (const office of offices) for (const [suffix, name, role, subject] of [['h1', 'Divisional Secretary', 'HOD', 'General'], ['h2', 'Assistant Secretary', 'HOD', 'Agriculture'], ['p', 'Intake & delivery', 'Peon', ''], ['o1', 'Development Officer', 'Officer', 'General'], ['o2', 'Agriculture Officer', 'Officer', 'Agriculture']]) s.people.push({ id: office + '-' + suffix, name, role: role as Role, office, active: true, subject });
  const examples = [['Request for school maintenance allocation', 'Provincial Education Office', 'COL', false], ['Agricultural support programme — district review', 'Department of Agriculture', 'COL', false], ['Sealed envelope for Divisional Secretary', 'Government Secretariat', 'COL', true], ['Road maintenance inspection report', 'Municipal Engineering Unit', 'KOT', false], ['Community hall reservation request', 'Community Development Society', 'COL', false], ['Public service counter improvements', 'District Secretariat', 'MAH', false]] as const;
  examples.forEach(([subject, sender, office, secret], i) => { const t = new Date(Date.now() - (i + 1) * 3600000).toISOString(); s.letters.push({ id: crypto.randomUUID(), ref: reference(s, office), office, subject, sender, received: t, entered: t, method: 'Post', condition: 'Good', language: 'English', secret, hod: office + (i === 1 ? '-h2' : '-h1'), officer: i === 1 ? office + '-o2' : '', instructions: i === 1 ? 'Review the district request and record your recommendation.' : '', delivery: i === 1 ? 'Assigned' : i === 4 ? 'Missing' : 'Registered', action: 'Not started', outcome: '', views: 0, sample: true, history: [{ at: t, actor: 'Intake & delivery', role: 'Peon', text: secret ? 'Restricted envelope receipt created' : 'Letter registered' }] }); });
  return s;
}

export function principal(state: State, user: AuthenticatedUser): Person {
  const email = user.email.toLowerCase();
  let person = state.people.find(p => p.active && (p.accountId === user.userId || p.accountEmail?.toLowerCase() === email));
  if (!person && (!state.administratorUserId || state.administratorUserId === user.userId)) {
    const government = state.people.find(p => p.id === 'gov');
    if (!government) throw new Error('Government administrator is missing');
    government.accountId = user.userId; government.accountEmail = user.email; government.name = user.displayName;
    state.administratorUserId = user.userId; state.administratorEmail = user.email; person = government;
  }
  if (!person) throw new Error('Your account has not been assigned a role. Ask the Government administrator to add your work email.');
  return person;
}

export function visible(p: Person, l: Letter) { return hasPermission(p, 'correspondence.view_all') || (p.office === l.office && hasPermission(p, 'correspondence.view_office')) || (p.role === 'Peon' && (l.registeredBy === p.id || l.registeredOffice === p.office || l.origin === p.office || l.handledOffices?.includes(p.office))) || (l.destination === p.office && (p.role === 'HOD' || p.role === 'Peon')) || (p.id === l.officer && hasPermission(p, 'correspondence.view_assigned')); }
export function canEditReceipt(p: Person, l: Letter) { return p.role === 'Peon' && visible(p, l) && (p.office === l.office || p.id === l.registeredBy || p.office === l.registeredOffice) && !l.secret; }
export function deliveryLabel(stage: string) { return ({ Registered: 'Awaiting HOD handover', 'With HOD': 'Physically with HOD', Assigned: 'Awaiting officer delivery', Delivered: 'Physically received', 'In transit': 'In delivery' } as Record<string, string>)[stage] || stage; }
export function peonTasks(p: Person, letters: Letter[]) {
  if (p.role !== 'Peon') return [];
  return letters.flatMap(letter => {
    const tasks: { letter: Letter; type: string; prompt: string }[] = [];
    if (letter.office === p.office && letter.destination && letter.delivery === 'Awaiting dispatch') tasks.push({ letter, type: 'dispatch', prompt: 'Send physical letter to ' + officeName[letter.destination] });
    if (letter.destination === p.office && letter.delivery === 'In transit') tasks.push({ letter, type: 'receive', prompt: 'Confirm physical arrival at ' + officeName[p.office] });
    if (letter.office === p.office && letter.replyDispatch?.status === 'Awaiting dispatch') tasks.push({ letter, type: 'dispatch-reply', prompt: 'Dispatch physical reply to ' + letter.replyDispatch.recipient });
    return tasks;
  });
}
export const sriLankaDate = (value = new Date()) => new Date(value.getTime() + 330 * 60000).toISOString().slice(0, 10);
function physicalDate(value: unknown, letter: Letter) {
  const date = text(value, 10);
  const parsed = new Date(date + 'T00:00:00Z');
  requireRule(/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date <= sriLankaDate() && date >= sriLankaDate(new Date(letter.received)), 'Choose a valid physical receipt date between initial receipt and today');
  return date;
}
export function contents(p: Person, l: Letter) { return visible(p, l) && (!l.secret || hasPermission(p, 'correspondence.view_secret_contents') && (p.role === 'Government' || p.id === l.hod)); }
export function publicLetter(p: Person, l: Letter): Letter { if (contents(p, l)) return l; return { ...l, subject: l.secret ? 'Sealed correspondence — envelope record' : l.subject, instructions: '', outcome: '', restrictedText: undefined, file: undefined, fileName: undefined, fileType: undefined, history: l.history.filter(e => !e.text.startsWith('Action:') && !e.text.startsWith('Instructions:') && !e.text.startsWith('Restricted contents:')) }; }
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function requirePermission(p: Person, permission: Permission) { requireRule(hasPermission(p, permission), 'Your ' + p.role + ' role does not have permission: ' + permission); }
function text(v: unknown, max = 4000) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

export function change(s: State, actor: Person, input: any): { id?: string } {
  const p = s.people.find(x => x.id === actor.id && x.active); requireRule(p, 'Your account is inactive'); const now = new Date().toISOString(); const log = (l: Letter, msg: string) => l.history.push({ at: now, actor: p.name + ' · ' + p.office, actorId: p.id, role: p.role, text: msg });
  if (input.type === 'register' || input.type === 'reply') {
    requirePermission(p, 'correspondence.register'); const parent = input.type === 'reply' ? s.letters.find(l => l.id === input.parent) : undefined; if (input.type === 'reply') requireRule(parent && contents(p, parent), 'Original letter unavailable'); const secret = !!input.secret; requireRule(input.type !== 'reply' || !secret, 'Secret replies must be handled by the HOD'); const subject = text(input.subject, 250), sender = text(input.sender, 200); requireRule(subject && sender, 'Subject / envelope label and sender are required'); const received = new Date(input.received); requireRule(!isNaN(received.getTime()) && received.getTime() <= Date.now() + 60000, 'Enter a valid receipt time, not in the future'); const hods = s.people.filter(x => x.active && x.office === p.office && x.role === 'HOD'); requireRule(hods.length, 'No active HOD available'); const department = text(input.department, 60); const byLoad = (a: Person, b: Person) => s.letters.filter(l => l.hod === a.id && l.delivery !== 'Delivered').length - s.letters.filter(l => l.hod === b.id && l.delivery !== 'Delivered').length; const matched = department ? hods.filter(h => h.subject === department) : []; const pool = matched.length ? matched : hods; const hod = secret ? hods.find(h => h.id === input.hod) : [...pool].sort(byLoad)[0]; requireRule(hod, 'Select the addressed HOD'); const id = crypto.randomUUID(); const l: Letter = { id, ref: reference(s, p.office), office: p.office, subject, sender, received: received.toISOString(), entered: now, method: text(input.method, 40) || 'Hand delivery', condition: text(input.condition, 200) || 'Good', language: text(input.language, 40) || 'English', secret, hod: hod.id, officer: '', instructions: '', delivery: 'Registered', action: 'Not started', outcome: '', views: 0, history: [], replyTo: parent?.id, registeredBy: p.id, registeredOffice: p.office, handledOffices: [p.office], department: !secret && department ? department : undefined }; log(l, secret ? 'Restricted envelope receipt created; contents not captured' : parent ? 'Reply registered; linked to ' + parent.ref : 'Letter registered' + (matched.length ? ' — routed to ' + department + ' HOD by workload' : ' — routed by workload across active HODs')); s.letters.unshift(l); return { id };
  }
  if (input.type === 'person') { requirePermission(p, 'accounts.manage'); const name = text(input.name, 100), email = text(input.email, 254).toLowerCase(); requireRule(name && offices.includes(input.office) && ['HOD', 'Peon', 'Officer'].includes(input.role), 'Enter valid name, office and role'); requireRule(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid work email'); requireRule(!s.people.some(x => x.accountEmail?.toLowerCase() === email), 'That work email already has a role. One person can hold one role only.'); s.people.push({ id: crypto.randomUUID(), name, office: input.office, role: input.role, active: true, accountEmail: email }); return {}; }
  if (input.type === 'deactivate') { requirePermission(p, 'accounts.manage'); const target = s.people.find(x => x.id === input.person); requireRule(target && target.role !== 'Government', 'Cannot deactivate this account'); requireRule(!s.letters.some(l => (l.hod === target.id || l.officer === target.id) && (l.delivery !== 'Delivered' || l.action === 'In progress')), 'Reassign this person’s open correspondence before deactivating'); target.active = false; return {}; }
  const l = s.letters.find(x => x.id === input.id); requireRule(l && visible(p, l), 'Letter unavailable for your role'); const decision = hasPermission(p, 'correspondence.assign') && p.office === l.office && (!l.secret || p.id === l.hod || p.role === 'Government'); const peon = p.role === 'Peon' && p.office === l.office;
  if (input.requireReceipt && ['handover-hod','deliver','receive'].includes(input.type)) requireRule(text(input.recipient,120), 'Named receipt required: enter the person who accepted the original');
  if (input.requireReceipt && input.type === 'dispatch') requireRule(text(input.note), 'Enter dispatch method or tracking details');
  switch (input.type) {
    case 'edit': {
      requireRule(canEditReceipt(p, l), 'Only a receiving PEON can correct ordinary receipt details');
      const subject=text(input.subject,250), sender=text(input.sender,200), received=new Date(input.received);
      requireRule(subject && sender && !isNaN(received.getTime()) && received.getTime()<=Date.now()+60000, 'Enter a subject, sender and valid receipt time');
      requireRule(text(input.reason), 'Give a reason for the correction');
      requireRule(!l.physicalReceivedDate || sriLankaDate(received) <= l.physicalReceivedDate, 'Initial receipt cannot be after officer physical receipt');
      const after = { subject, sender, received: received.toISOString(), method: text(input.method,40), condition: text(input.condition,200), language: text(input.language,40) };
      const changes: NonNullable<Event['changes']> = {};
      for (const key of Object.keys(after) as (keyof typeof after)[]) if (l[key] !== after[key]) changes[key] = { before: l[key], after: after[key] };
      if (!Object.keys(changes).length) break;
      Object.assign(l, after);
      log(l, 'Receipt corrected: ' + text(input.reason) + '\n' + Object.entries(changes).map(([key, value]) => key + ': ' + value.before + ' → ' + value.after).join('\n'));
      l.history[l.history.length - 1].changes = changes;
      break;
    }
    case 'view': log(l, 'Record viewed'); l.views++; break;
    case 'assign': { requirePermission(p, 'correspondence.assign'); requireRule(decision && !l.secret && !l.destination, 'Only a decision maker can assign ordinary letters'); const to = s.people.find(x => x.id === input.person && x.role === 'Officer' && x.active && x.office === l.office); requireRule(to, 'Choose an active officer in this office'); requireRule(text(input.note), 'Add instructions for the officer'); l.officer = to.id; l.assignedAt = now; l.physicalReceivedDate = undefined; l.action = 'Not started'; l.outcome = ''; l.actionAt = undefined; l.instructions = text(input.note); l.delivery = 'Assigned'; log(l, 'Assigned to ' + to.name); log(l, 'Instructions: ' + l.instructions); break; }
    case 'hod': { requirePermission(p, 'correspondence.reassign_hod'); requireRule(decision, 'Decision maker required'); const to = s.people.find(x => x.id === input.person && x.role === 'HOD' && x.active && x.office === l.office); requireRule(to && to.id !== l.hod, 'Choose another active HOD in this office'); const previousHod = s.people.find(x => x.id === l.hod); l.hod = to.id; log(l, 'Responsible HOD changed from ' + (previousHod?.name || 'Unassigned') + ' to ' + to.name + ' within ' + officeName[l.office]); break; }
    case 'handover-hod': requirePermission(p, 'correspondence.record_handover'); requireRule(peon && ['Registered', 'Missing', 'Returned to HOD'].includes(l.delivery) && !l.officer, 'Peon can hand this letter to the HOD before assignment'); l.delivery = l.secret ? 'Delivered' : 'With HOD'; log(l, 'Physical handover to ' + s.people.find(x => x.id === l.hod)?.name + (l.secret ? ' — delivery complete' : '')); break;
    case 'deliver': requirePermission(p, 'correspondence.record_handover'); requireRule(peon && !!l.officer && !l.destination && ['Assigned', 'Missing'].includes(l.delivery), 'An assigned officer is required before delivery'); l.physicalReceivedDate = physicalDate(input.physicalReceivedDate || sriLankaDate(), l); l.delivery = 'Delivered'; log(l, 'Physical handover to ' + s.people.find(x => x.id === l.officer)?.name + ' — delivery complete; physical receipt date: ' + l.physicalReceivedDate); break;
    case 'physical-receipt': {
      requireRule(p.role === 'Officer' && p.id === l.officer && !l.destination && !l.physicalReceivedDate, 'Only the assigned officer can confirm an unrecorded physical receipt');
      l.physicalReceivedDate = physicalDate(input.physicalReceivedDate, l);
      l.delivery = 'Delivered'; l.issue = undefined;
      log(l, 'Officer physically received original on ' + l.physicalReceivedDate + ' — delivery complete'); break;
    }
    case 'reply-ready': {
      requireRule(p.role === 'Officer' && p.id === l.officer && !l.destination && !l.secret, 'Only the assigned officer can prepare an ordinary reply');
      requireRule(l.replyDispatch?.status !== 'Awaiting dispatch', 'A reply is already awaiting dispatch');
      const recipient = text(input.recipient, 200), address = text(input.address, 1000), note = text(input.note);
      requireRule(recipient && address && note, 'Enter the recipient, postal address and reply details');
      l.replyDispatch = { status: 'Awaiting dispatch', recipient, address, note, readyAt: now, readyBy: p.id };
      log(l, 'Reply ready for physical dispatch to ' + recipient + ' at ' + address + '. Reply details: ' + note); break;
    }
    case 'dispatch-reply': {
      requirePermission(p, 'correspondence.record_handover');
      requireRule(peon && l.replyDispatch?.status === 'Awaiting dispatch', 'Only the office PEON can dispatch a ready reply');
      requireRule(text(input.note), 'Enter dispatch method or tracking details');
      Object.assign(l.replyDispatch, { status: 'Dispatched', dispatchedAt: now, dispatchedBy: p.id, dispatchNote: text(input.note) });
      log(l, 'Physical reply dispatched to ' + l.replyDispatch.recipient + ': ' + text(input.note)); break;
    }
    case 'missing': requirePermission(p, p.role === 'Peon' ? 'correspondence.record_handover' : 'correspondence.record_action'); requireRule((peon || p.id === l.officer || p.office === l.destination) && l.delivery !== 'Delivered', 'Cannot mark completed delivery missing'); requireRule(text(input.note), 'Explain the delivery issue'); if (l.delivery !== 'In transit' && l.delivery !== 'Awaiting dispatch') l.delivery = 'Missing'; l.issue=text(input.note); log(l, 'Physical delivery exception: ' + text(input.note)); break;
    case 'reject': requirePermission(p, 'correspondence.record_action'); requireRule(p.id === l.officer && !l.secret && !l.destination, 'Only the assigned officer can return this letter'); requireRule(text(input.note), 'Give a reason for returning it'); l.officer = ''; l.assignedAt = undefined; l.physicalReceivedDate = undefined; l.action = 'Not started'; l.actionAt = undefined; l.outcome = ''; l.delivery = 'Returned to HOD'; log(l, 'Assignment returned to HOD: ' + text(input.note)); break;
    case 'action': requirePermission(p, 'correspondence.record_action'); requireRule((p.id === l.officer || decision) && !l.destination && contents(p, l), 'You cannot act on this letter'); requireRule(['In progress', 'Action recorded'].includes(input.status), 'Choose an action status'); requireRule(text(input.note), 'Describe your action'); l.action = input.status; l.actionAt = now; l.outcome = text(input.note); log(l, 'Action: ' + input.status + ' — ' + l.outcome); break;
    case 'secret': requirePermission(p, 'correspondence.record_secret_contents'); requireRule(l.secret && decision, 'Addressed HOD or Government required'); requireRule(text(input.note), 'Enter the restricted contents'); l.restrictedText = text(input.note); log(l, 'Restricted contents: recorded by authorized decision maker'); break;
    case 'forward': { requirePermission(p, 'correspondence.forward'); requireRule(decision && !l.secret && !l.destination && l.replyDispatch?.status !== 'Awaiting dispatch', 'Only ordinary correspondence without an active transfer can be forwarded'); requireRule(offices.includes(input.office) && input.office !== l.office, 'Select another office'); requireRule(s.people.some(x => x.active && x.role === 'HOD' && x.office === input.office), 'No active HOD at the destination'); const destination = input.office as keyof typeof officeName; l.destination = destination; l.intended = text(input.note, 200); l.delivery = 'Awaiting dispatch'; log(l, 'Advance notice sent to ' + officeName[destination] + ' HOD and intake queues' + (l.intended ? '; intended recipient: ' + l.intended : '')); break; }
    case 'dispatch': requirePermission(p, 'correspondence.record_handover'); requireRule(peon && l.delivery === 'Awaiting dispatch', 'Sending peon records dispatch after HOD decision'); l.delivery = 'In transit'; log(l, 'Original dispatched to ' + officeName[l.destination!]); break;
    case 'receive': { requirePermission(p, 'correspondence.record_handover'); requireRule(p.role === 'Peon' && p.office === l.destination && l.delivery === 'In transit', 'Destination peon records arrival after dispatch'); requireRule(s.people.some(x => x.active && x.role === 'HOD' && x.office === p.office), 'No destination HOD available'); l.handledOffices = [...new Set([...(l.handledOffices || []), l.office, p.office])]; l.previousRefs = [...(l.previousRefs || []), l.ref]; l.origin = l.office; l.office = p.office; l.ref = reference(s, p.office); l.destination = undefined; l.officer = ''; l.assignedAt = undefined; l.physicalReceivedDate = undefined; l.action = 'Not started'; l.actionAt = undefined; l.outcome = ''; l.instructions = ''; const destHods = s.people.filter(x => x.active && x.role === 'HOD' && x.office === p.office); requireRule(destHods.length, 'No destination HOD available'); const byLoad = (a: Person, b: Person) => s.letters.filter(x => x.hod === a.id && x.delivery !== 'Delivered').length - s.letters.filter(x => x.hod === b.id && x.delivery !== 'Delivered').length; l.hod = [...destHods].sort(byLoad)[0].id; l.department = undefined; l.delivery = 'Registered'; log(l, 'Arrived at destination office; registered as ' + l.ref); break; }
    case 'file': requireRule(contents(p, l) && (hasPermission(p, 'correspondence.register') || decision) && (!l.secret || decision), 'Cannot attach contents to this record'); requireRule(typeof input.key === 'string', 'Invalid attachment'); l.file = input.key; l.fileName = input.name; l.fileType = input.mime; log(l, 'Scan attached: ' + input.name); break;
    default: throw new Error('Unknown action');
  }
  if (['handover-hod','deliver','receive','dispatch'].includes(input.type)) {
    l.issue=undefined;
    if(text(input.recipient,120)) log(l,'Receipt confirmed by: '+text(input.recipient,120));
    if(text(input.note)) log(l,'Handover note: '+text(input.note));
  }
  return { id: l.id };
}
