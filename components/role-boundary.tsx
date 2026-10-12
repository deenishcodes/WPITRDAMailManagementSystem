'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppRole } from '@/lib/role-accounts';

// Recheck on focus/back navigation so a dashboard left open in another tab cannot
// retain the previous account's controls after sign-out or an account switch.
export function RoleBoundary({ role, children }: { role: AppRole; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const accountEmail = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    async function verify() {
      if (!alive) return;
      setReady(false);
      try {
        const r = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await r.json() as { user?: { role: string; email: string }; redirect?: string };
        if (!r.ok || !data.user) { window.location.replace('/login'); return; }
        if (data.user.role !== role) { window.location.replace('/'); return; }
        if (accountEmail.current && accountEmail.current !== data.user.email) { window.location.replace('/'); return; }
        accountEmail.current = data.user.email;
        if (alive) setReady(true);
      } catch { window.location.replace('/login'); }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') setReady(false); else void verify(); };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('wpitrda-session');
    if (channel) channel.onmessage = () => void verify();
    void verify();
    window.addEventListener('focus', verify);
    window.addEventListener('pageshow', verify);
    document.addEventListener('visibilitychange', visibility);
    return () => { alive = false; channel?.close(); window.removeEventListener('focus', verify); window.removeEventListener('pageshow', verify); document.removeEventListener('visibilitychange', visibility); };
  }, [role]);
  return <><div hidden={!ready}>{children}</div>{!ready && <main className="pd-loading"><p>Opening your workspace…</p></main>}</>;
}
export function announceSessionChange() {
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('wpitrda-session'); channel.postMessage('changed'); channel.close(); }
}
