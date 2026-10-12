'use client';
import { Mail, ArrowRight, LockKeyhole, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL, type Role } from '@/lib/correspondence/types';

export function CorrespondenceLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground">
      <Mail className="animate-pulse" size={28} />
      <p>Opening the correspondence workspace…</p>
    </main>
  );
}

export function CorrespondenceSignIn({ returnTo }: { returnTo: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-2 text-2xl font-semibold">
        <Mail /> Main Management System
      </div>
      <p className="max-w-md text-muted-foreground">
        Sign in with your assigned PEON, HOD, OFFICER or SUPER AUTHORITY account.
      </p>
      <Button asChild size="lg">
        <a href="/login" target="_top">
          Sign in <ArrowRight size={18} />
        </a>
      </Button>
    </main>
  );
}

export function CorrespondenceNeedsOnboarding({ message }: { message?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <LockKeyhole size={32} className="text-muted-foreground" />
      <h1 className="text-xl font-semibold">Your account isn&apos;t onboarded yet</h1>
      <p className="max-w-md text-muted-foreground">
        {message || 'Ask an Admin to add your work email to an office and role in the correspondence workspace.'}
      </p>
    </main>
  );
}

export function CorrespondenceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle size={32} className="text-destructive" />
      <p className="max-w-md text-muted-foreground">{message || 'Something went wrong loading the workspace.'}</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}

export function CorrespondenceWrongRole({ role, expected }: { role: Role; expected: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <LockKeyhole size={32} className="text-muted-foreground" />
      <p className="max-w-md text-muted-foreground">
        Your account is registered as {ROLE_LABEL[role]}. This page is for {expected}.
      </p>
      <Button asChild variant="outline">
        <a href="/correspondence">Go to your workspace</a>
      </Button>
    </main>
  );
}
