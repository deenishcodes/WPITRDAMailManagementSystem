import { env } from 'cloudflare:workers';

// Attachment signatures are bound to the authenticated account.
function signingKey() { const value = (env as unknown as { WPITRDA_ACCOUNT_CREDENTIALS?: string }).WPITRDA_ACCOUNT_CREDENTIALS; if (!value) throw new Error('File access is not configured.'); return value; }

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PresignedUpload = { url: string; key: string; expiresAt: number };
export type PresignedDownload = { url: string; expiresAt: number };

// --- S3 integration point ---
// The PRD specifies the organization's registered S3 file storage, used through its
// presigned-URL upload/download pattern: a caller asks for a URL, then PUTs/GETs the file
// directly against storage rather than routing bytes through application logic on every call.
// Real S3 isn't available in this environment, so this module reproduces the same pattern
// against the Worker's own R2 bucket (already wired up for the peon desk's scan attachments,
// see app/api/scan/route.ts): `createUploadUrl` mints a short-lived signed URL to this app's own
// upload endpoint, the caller PUTs bytes to it, and `createDownloadUrl` does the same for reads.
// Swapping to real S3 later means replacing the bodies of these two functions with calls to the
// S3 SDK's `getSignedUrl` (PutObjectCommand / GetObjectCommand) — every caller elsewhere in
// lib/correspondence keeps working against the same {url, key, expiresAt} shape.
export async function createUploadUrl(
  key: string,
  contentType: string,
  accountId: string,
  expiresInSeconds = 300,
): Promise<PresignedUpload> {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const sig = await sign(`upload:${accountId}:${key}:${contentType}:${expiresAt}`);
  const params = new URLSearchParams({ key, type: contentType, expires: String(expiresAt), sig });
  return { url: `/api/correspondence/attachments/upload?${params.toString()}`, key, expiresAt };
}

export async function verifyUploadUrl(
  key: string,
  contentType: string,
  expires: number,
  sig: string,
  accountId: string,
): Promise<void> {
  if (!Number.isFinite(expires) || Date.now() > expires) {
    throw new Error('This upload link has expired. Request a new one.');
  }
  const expected = await sign(`upload:${accountId}:${key}:${contentType}:${expires}`);
  if (expected !== sig) throw new Error('This upload link is invalid.');
}

export async function createDownloadUrl(key: string, accountId: string, expiresInSeconds = 300): Promise<PresignedDownload> {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const sig = await sign(`download:${accountId}:${key}:${expiresAt}`);
  const params = new URLSearchParams({ key, expires: String(expiresAt), sig });
  return { url: `/api/correspondence/attachments/download?${params.toString()}`, expiresAt };
}

export async function verifyDownloadUrl(key: string, expires: number, sig: string, accountId: string): Promise<void> {
  if (!Number.isFinite(expires) || Date.now() > expires) {
    throw new Error('This download link has expired. Request a new one.');
  }
  const expected = await sign(`download:${accountId}:${key}:${expires}`);
  if (expected !== sig) throw new Error('This download link is invalid.');
}

export function bucket(): R2Bucket {
  const b = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!b) throw new Error('File storage is unavailable.');
  return b;
}

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
