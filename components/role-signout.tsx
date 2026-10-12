'use client';
import { useState } from 'react';
import { announceSessionChange } from './role-boundary';
export function RoleSignOut() {
  const [error, setError] = useState('');
  return <><button onClick={async () => {
    try { const r = await fetch('/api/auth/session', { method: 'DELETE' }); if (!r.ok) throw new Error('Sign out failed. Please try again.'); announceSessionChange(); window.location.replace('/login'); }
    catch (e) { setError((e as Error).message); }
  }}>Sign out</button>{error && <p role="alert">{error}</p>}</>;
}
