'use client';
import { useState, type FormEvent } from 'react';
import { Mail, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { announceSessionChange } from '@/components/role-boundary';
export default function LoginForm() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [platform, setPlatform] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await r.json() as { error?: string; user: { role: string } };
      if (!r.ok) { setPlatform(data.error === 'Sign in to open the correspondence workspace'); throw new Error(data.error); }
      const homes: Record<string, string> = { peon: '/peon', hod: '/hod', officer: '/officer', super_authority: '/authority' };
      const home = homes[data.user.role];
      if (!home) throw new Error('Your account has no assigned dashboard.');
      announceSessionChange();
      window.location.replace(home);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <main className="pd-login"><section className="pd-login-story"><div className="pd-logo"><Mail/><span>Mail<span>Management System</span></span></div><div><h1>Mail Management<br/>System</h1><p>Sign in to your assigned workspace.</p></div><small>PEON · HOD · OFFICER · SUPER AUTHORITY</small></section><section className="pd-login-panel"><div className="pd-login-form"><h2>Sign in</h2><p>Use your assigned email and password.</p><form onSubmit={submit}><label className="pd-field"><span>Email</span><Input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="pd-field"><span>Password</span><Input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="pd-error">{error}</p>}{platform?<a href="/signin-with-chatgpt?return_to=/login" target="_top">Open your private workspace with ChatGPT →</a>:<Button disabled={busy} type="submit">{busy?'Signing in…':'Sign in'}</Button>}</form><div className="pd-login-note"><LockKeyhole/><p>Your account opens only its assigned dashboard.</p></div></div></section></main>;
}
