import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME } from '../constants.js';

export const BUCKET = 'documents';

/** Keeps the extension, drops everything that is not safe in an object path. */
export function safeFileName(name) {
  const n = String(name ?? 'file').replace(/[\\/]/g, '_').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '').slice(-120);
  return n || 'file';
}
export const storagePathFor = (userId, docId, name) => `${userId}/${docId}/${safeFileName(name)}`;

export function validateFileMeta({ size, type }) {
  if (!DOCUMENT_MIME.includes(type)) return 'type';
  if (!(size >= 0) || size > DOCUMENT_MAX_BYTES) return 'size';
  return null;
}

export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(String(dataUrl ?? ''));
  if (!m) throw new Error('invalid data URL');
  const isB64 = /;base64/i.test(m[2]);
  const raw = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}
