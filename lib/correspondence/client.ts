import { useCallback, useEffect, useState } from 'react';
import type { CorrUser, Office, Letter, NotificationRow, NotificationLogRow, Mailbox, Movement, Attachment } from './types';

export type Snapshot = {
  me: CorrUser;
  letters: Letter[];
  notifications: NotificationRow[];
  offices?: Office[];
  users?: CorrUser[];
  mailboxes?: Mailbox[];
  notificationLog?: NotificationLogRow[];
};

export type LetterFilterState = { search?: string; status?: string };

export function useCorrespondence(filters?: LetterFilterState) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.status) params.set('status', filters.status);
      const qs = params.toString();
      const r = await fetch('/api/correspondence' + (qs ? '?' + qs : ''), { cache: 'no-store' });
      const d = await r.json() as Snapshot & { error?: string };
      if (r.status === 401) {
        setNeedsSignIn(true);
        setNeedsOnboarding(false);
        setData(null);
        return;
      }
      if (r.status === 403) {
        setNeedsOnboarding(true);
        setNeedsSignIn(false);
        setError(d.error || '');
        setData(null);
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Unable to load the correspondence workspace.');
      setNeedsSignIn(false);
      setNeedsOnboarding(false);
      setData(d as Snapshot);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect. Try again.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.search, filters?.status]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json() as Record<string, unknown> & { error?: string };
    if (!r.ok) throw new Error(d.error || 'Unable to save. Please try again.');
    return d;
  }, []);

  return { data, loading, error, needsSignIn, needsOnboarding, reload: load, mutate };
}

export async function fetchLetterDetail(letterId: string): Promise<{ letter: Letter; movements: Movement[]; attachments: Attachment[] }> {
  const r = await fetch('/api/correspondence?letter=' + encodeURIComponent(letterId), { cache: 'no-store' });
  const d = await r.json() as { letter: Letter; movements: Movement[]; attachments: Attachment[]; error?: string };
  if (!r.ok) throw new Error(d.error || 'Unable to load this letter.');
  return d;
}

export type UploadedAttachment = { key: string; fileName: string; mimeType: string; size: number };

export async function uploadAttachment(kind: 'scan' | 'supporting', file: File, letterId?: string): Promise<UploadedAttachment> {
  const reqRes = await fetch('/api/correspondence/attachments/request-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, letterId, fileName: file.name, mimeType: file.type, size: file.size }),
  });
  const req = await reqRes.json() as { url: string; key: string; error?: string };
  if (!reqRes.ok) throw new Error(req.error || 'Could not start the upload.');
  const putRes = await fetch(req.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  const put = await putRes.json() as { error?: string };
  if (!putRes.ok) throw new Error(put.error || 'Upload failed.');
  return { key: req.key as string, fileName: file.name, mimeType: file.type, size: file.size };
}

export async function openAttachment(attachmentId: string): Promise<void> {
  const r = await fetch('/api/correspondence/attachments/request-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attachmentId }),
  });
  const d = await r.json() as { url: string; error?: string };
  if (!r.ok) throw new Error(d.error || 'Could not open this file.');
  window.open(d.url as string, '_blank', 'noopener');
}

export function checkAttachmentFile(file: File): void {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!file.size || file.size > 15 * 1024 * 1024 || !allowed.includes(file.type)) {
    throw new Error('Choose a non-empty PDF, JPEG or PNG up to 15 MB.');
  }
}

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric' });
}
