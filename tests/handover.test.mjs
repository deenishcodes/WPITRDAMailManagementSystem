import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, change, visible, peonTasks, deliveryLabel, sriLankaDate } from '../lib/model.ts';
import { accountForEmail, accountActor } from '../lib/role-accounts.ts';

function setup() {
  const state = seed();
  const person = id => state.people.find(p => p.id === id);
  const peon = person('COL-p'), hod = person('COL-h1'), officer = person('COL-o1');
  const { id } = change(state, peon, { type: 'register', subject: 'Handover test', sender: 'Sender', received: '2026-09-01T08:00:00+05:30', department: 'General' });
  const letter = state.letters.find(l => l.id === id);
  return { state, person, peon, hod, officer, letter, id, act: (actor, input) => change(state, actor, { id, ...input }) };
}

test('corrections after handover keep routing, timestamps and old/new field values', () => {
  const { act, peon, hod, officer, letter } = setup();
  act(hod, { type: 'assign', person: officer.id, note: 'Review' });
  const originalHistory = structuredClone(letter.history), assignment = letter.assignedAt, entered = letter.entered;
  const correction = { type: 'edit', subject: 'Corrected subject', sender: 'Correct sender', received: letter.received, method: 'Post', condition: 'Good', language: 'English', reason: 'Correct a transcription error' };
  assert.throws(() => act(officer, correction));
  assert.throws(() => act(peon, { ...correction, reason: '' }));
  act(peon, correction);
  assert.deepEqual(letter.history.slice(0, originalHistory.length), originalHistory);
  assert.deepEqual(letter.history.at(-1).changes.subject, { before: 'Handover test', after: 'Corrected subject' });
  assert.equal(letter.history.at(-1).actorId, peon.id);
  assert.equal(letter.assignedAt, assignment); assert.equal(letter.entered, entered);
  assert.equal(letter.officer, officer.id); assert.equal(letter.delivery, 'Assigned');
  const count = letter.history.length;
  act(peon, correction); assert.equal(letter.history.length, count, 'No-op corrections should not add misleading events');
});

test('digital assignment and backdated physical receipt are independent', () => {
  const { act, peon, hod, officer, letter } = setup();
  act(hod, { type: 'assign', person: officer.id, note: 'Review' });
  assert(letter.assignedAt); assert.equal(letter.physicalReceivedDate, undefined);
  for (const date of ['2026-02-30', '2099-01-01', '2026-08-31', '']) {
    assert.throws(() => act(officer, { type: 'physical-receipt', physicalReceivedDate: date }));
  }
  assert.throws(() => act(hod, { type: 'physical-receipt', physicalReceivedDate: '2026-09-28' }));
  act(officer, { type: 'physical-receipt', physicalReceivedDate: '2026-09-28' });
  assert.equal(letter.physicalReceivedDate, '2026-09-28'); assert.equal(letter.delivery, 'Delivered');
  assert.notEqual(letter.physicalReceivedDate, letter.assignedAt.slice(0, 10));
  assert.throws(() => act(officer, { type: 'physical-receipt', physicalReceivedDate: '2026-09-29' }));
  assert.throws(() => act(peon, { type: 'edit', subject: 'Bad date', sender: 'Sender', received: '2026-09-29T00:00:00Z', reason: 'Date correction' }));
  act(officer, { type: 'action', status: 'In progress', note: 'Awaiting response from another office' });
  assert(letter.actionAt); assert.equal(letter.action, 'In progress');
});

test('PEON delivery can record actual receipt date and reassignment clears only current receipt', () => {
  const { act, peon, hod, officer, letter } = setup();
  act(hod, { type: 'assign', person: officer.id, note: 'Review' });
  act(peon, { type: 'deliver', recipient: 'Named officer', requireReceipt: true, physicalReceivedDate: '2026-09-28' });
  assert.equal(letter.physicalReceivedDate, '2026-09-28');
  act(officer, { type: 'reject', note: 'Wrong division' });
  assert.equal(letter.physicalReceivedDate, undefined);
  assert(letter.history.some(e => e.text.includes('2026-09-28')));
  act(hod, { type: 'assign', person: 'COL-o2', note: 'Reassigned' });
  assert.equal(letter.delivery, 'Assigned'); assert.equal(letter.physicalReceivedDate, undefined);
});

test('dispatch tasks identify destination and survive source-office transfer', () => {
  const { act, state, peon, hod, person, letter } = setup();
  act(hod, { type: 'forward', office: 'MAH', note: 'For Maharagama' });
  assert.equal(peonTasks(peon, [letter])[0].prompt, 'Send physical letter to Maharagama office');
  assert.equal(peonTasks(person('MAH-p'), [letter]).length, 0);
  assert.throws(() => act(hod, { type: 'assign', person: 'COL-o1', note: 'Cannot cancel dispatch' }));
  assert.throws(() => act(peon, { type: 'dispatch', requireReceipt: true, note: '' }));
  act(peon, { type: 'dispatch', requireReceipt: true, note: 'Courier 123' });
  assert.equal(peonTasks(peon, [letter]).length, 0);
  assert.equal(peonTasks(person('MAH-p'), [letter])[0].type, 'receive');
  act(person('MAH-p'), { type: 'receive', recipient: 'Receiving clerk', requireReceipt: true });
  assert(visible(peon, letter)); assert.equal(letter.office, 'MAH');
  assert.equal(peonTasks(person('MAH-p'), [letter]).length, 0);
  assert.equal(state.letters.find(l => l.id === letter.id).registeredOffice, 'COL');
});

test('two HOD logins map to distinct people; same-office delegation is audited', () => {
  const { state, act, hod, letter } = setup();
  const first = accountActor(state, accountForEmail('hod@wpitrda.lk'));
  const second = accountActor(state, accountForEmail('hod2@wpitrda.lk'));
  assert.notEqual(first.id, second.id); assert.equal(first.office, second.office);
  act(hod, { type: 'hod', person: second.id });
  assert.equal(letter.hod, second.id);
  assert.match(letter.history.at(-1).text, /changed from .* to .* within Colombo office/);
  act(second, { type: 'assign', person: 'COL-o1', note: 'Covering leave' });
  assert.equal(letter.history.at(-1).actorId, second.id);
  assert.throws(() => act(second, { type: 'hod', person: 'MAH-h1' }));
});

test('additional provisioned HODs resolve to the same separate HOD dashboard', () => {
  const { state, person } = setup();
  change(state, person('gov'), { type: 'person', name: 'Leave cover', email: 'cover@example.test', office: 'MAH', role: 'HOD' });
  const account = accountForEmail('COVER@example.test', state);
  assert.equal(account.role, 'hod'); assert.equal(account.home, '/hod');
  assert.equal(accountActor(state, account).office, 'MAH');
  state.people.find(p => p.id === account.personId).active = false;
  assert.equal(accountForEmail('cover@example.test', state), undefined);
  assert.equal(accountForEmail('unknown@example.test', state), undefined);
});

test('HOD dropdown targets are validated against active officers in the office', () => {
  const { act, hod, person, officer } = setup();
  assert.throws(() => act(hod, { type: 'assign', person: 'MAH-o1', note: 'Wrong office' }));
  assert.throws(() => act(hod, { type: 'assign', person: 'COL-h2', note: 'Wrong role' }));
  person(officer.id).active = false;
  assert.throws(() => act(hod, { type: 'assign', person: officer.id, note: 'Inactive' }));
});

test('officer reply creates physical PEON task and only PEON can finish it', () => {
  const { act, peon, hod, officer, person, letter } = setup();
  act(hod, { type: 'assign', person: officer.id, note: 'Review' });
  const ready = { type: 'reply-ready', recipient: 'Sender', address: 'Postal address', note: 'Signed reply is ready' };
  assert.throws(() => act(peon, ready));
  assert.throws(() => act(officer, { ...ready, address: '' }));
  act(officer, ready);
  assert.equal(letter.action, 'Not started', 'Reply preparation must not force completion');
  assert.equal(peonTasks(peon, [letter])[0].type, 'dispatch-reply');
  assert.equal(peonTasks(person('MAH-p'), [letter]).length, 0);
  assert.throws(() => act(officer, ready));
  assert.throws(() => act(hod, { type: 'forward', office: 'MAH' }));
  for (const actor of [officer, hod, person('gov'), person('MAH-p')]) assert.throws(() => act(actor, { type: 'dispatch-reply', note: 'Courier' }));
  assert.throws(() => act(peon, { type: 'dispatch-reply' }));
  act(peon, { type: 'dispatch-reply', note: 'Registered post AB123' });
  assert.equal(letter.replyDispatch.status, 'Dispatched');
  assert.equal(letter.replyDispatch.dispatchedBy, peon.id);
  assert.equal(peonTasks(peon, [letter]).length, 0);
  assert.throws(() => act(peon, { type: 'dispatch-reply', note: 'Duplicate' }));
  assert(letter.history.some(e => e.text.includes('Registered post AB123')));
});

test('delivery wording is distinct from action completion and local dates use Sri Lanka time', () => {
  assert.equal(deliveryLabel('Delivered'), 'Physically received');
  assert.equal(deliveryLabel('Assigned'), 'Awaiting officer delivery');
  assert.equal(deliveryLabel('In transit'), 'In delivery');
  assert.equal(sriLankaDate(new Date('2026-09-27T20:00:00Z')), '2026-09-28');
});
