/** Redact filesystem / home paths for streamer mode. Keeps drive + filename. */
export function obscurePath(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return '••••';

  const file = parts[parts.length - 1];
  const root = /^[a-zA-Z]:$/.test(parts[0]) ? parts[0] : null;

  if (parts.length === 1) return obscureSegment(file);

  if (root) {
    return parts.length === 2 ? `${root}/••••` : `${root}/…/${file}`;
  }

  return `…/${file}`;
}

/** Redact URLs — keep scheme only. */
export function obscureUrl(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return `${url.protocol}//••••`;
  } catch {
    return '••••';
  }
}

export function obscureSensitive(
  value: string | null | undefined,
  kind: 'path' | 'url' | 'auto' = 'auto',
): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (kind === 'url') return obscureUrl(raw);
  if (kind === 'path') return obscurePath(raw);
  if (/^https?:\/\//i.test(raw)) return obscureUrl(raw);
  return obscurePath(raw);
}

function obscureSegment(segment: string): string {
  if (segment.length <= 4) return '••••';
  return `${segment.slice(0, 1)}••••${segment.slice(-1)}`;
}
