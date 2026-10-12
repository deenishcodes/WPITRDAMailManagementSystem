import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.WPITRDA_TEST_URL || 'http://localhost:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Only run against a disposable localhost workspace.');
const accounts = JSON.parse(fs.readFileSync(process.argv[2] || '.sites-runtime/local-accounts.json', 'utf8'));
async function request(route, jar, body) {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { cookie: jar, origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}
const platform = await request('/signin-with-chatgpt?return_to=/login', '');
const platformCookie = platform.response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
assert(platformCookie);
const jars = {};
for (const email of ['peon@wpitrda.lk', 'hod@wpitrda.lk', 'hod2@wpitrda.lk', 'officer@wpitrda.lk', 'authority@wpitrda.lk']) {
  const account = accounts.find(a => a.email === email); assert(account);
  const result = await request('/api/auth/session', platformCookie, account);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  jars[email.split('@')[0]] = platformCookie + '; ' + result.response.headers.getSetCookie()[0].split(';')[0];
}
async function mutate(role, body, expected = 200) {
  const result = await request(role === 'peon' ? '/api/peon' : '/api/desk', jars[role], body);
  assert.equal(result.response.status, expected, JSON.stringify(result.data)); return result.data;
}
async function letterFor(role, id) {
  const result = await request(role === 'peon' ? '/api/peon' : '/api/desk', jars[role]);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data.letters.find(l => l.id === id);
}
const received = new Date(Date.now() - 7 * 86400000).toISOString();
const registration = { type: 'register', subject: 'LOCAL QA — handover ' + Date.now(), sender: 'Local test only', received, method: 'Post', condition: 'Good', language: 'English', department: 'General' };
const { id } = await mutate('peon', registration);
await mutate('peon', { type: 'handover-hod', id, recipient: 'Local HOD' });
await mutate('hod', { type: 'hod', id, person: 'COL-h2' });
await mutate('hod2', { type: 'assign', id, person: 'COL-o1', note: 'Covering leave: review this test letter' });
let letter = await letterFor('officer', id); assert(letter.assignedAt); assert.equal(letter.hod, 'COL-h2');
await mutate('authority', { type: 'action', id, status: 'In progress', note: 'Forbidden' }, 400);
await mutate('peon', { ...registration, type: 'edit', id, subject: 'LOCAL QA — corrected subject', reason: 'Correct transcription' });
letter = await letterFor('officer', id);
assert.equal(letter.history.at(-1).changes.subject.before, registration.subject);
const physicalReceivedDate = new Date(Date.now() - 86400000 + 330 * 60000).toISOString().slice(0, 10);
await mutate('officer', { type: 'physical-receipt', id, physicalReceivedDate });
await mutate('officer', { type: 'action', id, status: 'In progress', note: 'Waiting for supporting information' });
await mutate('officer', { type: 'reply-ready', id, recipient: 'Local test recipient', address: 'Local test postal address', note: 'Physical reply is ready' });
letter = await letterFor('peon', id);
assert.equal(letter.physicalReceivedDate, physicalReceivedDate);
assert.equal(letter.replyDispatch.status, 'Awaiting dispatch'); assert.equal(letter.action, 'In progress');
await mutate('officer', { type: 'dispatch-reply', id, note: 'Forbidden' }, 400);
await mutate('peon', { type: 'dispatch-reply', id, note: 'Local registered post QA123' });
letter = await letterFor('authority', id);
assert.equal(letter.replyDispatch.status, 'Dispatched');
assert.equal(letter.replyDispatch.dispatchedBy, 'COL-p');
assert(letter.history.some(e => e.actorId === 'COL-h2'));
console.log('PASS registration, HOD handover/delegation, second-HOD assignment, audited correction, separate receipt date, action and physical reply dispatch');

const transfer = await mutate('peon', { ...registration, subject: 'LOCAL QA — transfer ' + Date.now() });
await mutate('hod2', { type: 'forward', id: transfer.id, office: 'MAH', note: 'For Maharagama office' });
letter = await letterFor('peon', transfer.id); assert.equal(letter.delivery, 'Awaiting dispatch'); assert.equal(letter.destination, 'MAH');
await mutate('peon', { type: 'dispatch', id: transfer.id, note: 'Local courier QA456' });
letter = await letterFor('peon', transfer.id); assert.equal(letter.delivery, 'In transit');
await mutate('peon', { type: 'dispatch', id: transfer.id, note: 'Duplicate' }, 400);
console.log('PASS visible cross-office dispatch state, dispatch history and duplicate rejection');

const forged = await fetch(base + '/api/desk', { method: 'POST', headers: { cookie: jars.hod, origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'view', id }) });
assert([400, 403].includes(forged.status), 'The app or its outer request guard must reject the cross-origin write');
console.log('PASS cross-origin mutation rejected');
