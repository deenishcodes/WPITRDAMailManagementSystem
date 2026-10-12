import type { Person, State } from './model';

export const ACCOUNTS = [
  { email: 'peon@wpitrda.lk', role: 'peon', label: 'PEON', home: '/peon', personId: 'COL-p', legacyRole: 'Peon', corrRole: 'peon' },
  { email: 'hod@wpitrda.lk', role: 'hod', label: 'HOD', home: '/hod', personId: 'COL-h1', legacyRole: 'HOD', corrRole: 'hod' },
  { email: 'hod2@wpitrda.lk', role: 'hod', label: 'HOD', home: '/hod', personId: 'COL-h2', legacyRole: 'HOD', corrRole: 'hod' },
  { email: 'officer@wpitrda.lk', role: 'officer', label: 'OFFICER', home: '/officer', personId: 'COL-o1', legacyRole: 'Officer', corrRole: 'officer' },
  { email: 'authority@wpitrda.lk', role: 'super_authority', label: 'SUPER AUTHORITY', home: '/authority', personId: 'gov', legacyRole: 'Government', corrRole: 'admin' },
] as const;
export type AppRole = typeof ACCOUNTS[number]['role'];
export type Account = { email: string; role: AppRole; label: string; home: string; personId: string; legacyRole: Person['role']; corrRole: 'peon' | 'hod' | 'officer' | 'admin' };
export function accountForEmail(email: string, state?: State): Account | undefined {
  const normalized = email.trim().toLowerCase();
  const fixed = ACCOUNTS.find(a => a.email === normalized);
  if (fixed) return fixed;
  const person = state?.people.find(p => p.active && p.accountEmail?.toLowerCase() === normalized);
  if (!person || person.role === 'Government') return undefined;
  const template = ACCOUNTS.find(a => a.legacyRole === person.role);
  return template && { ...template, email: normalized, personId: person.id };
}
export const accountForRole = (role: string) => ACCOUNTS.find(a => a.role === role);
export function accountActor(state: State, account: Account): Person {
  const person = state.people.find(p => p.id === account.personId);
  if (!person?.active || person.role !== account.legacyRole) throw new Error('Forbidden: account inactive or role assignment invalid.');
  return { ...person, accountEmail: account.email };
}
