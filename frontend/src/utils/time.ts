import i18n from '@/i18n';

const { t } = i18n.global;

export function formatRelativeTime(timestampMs: number, nowMs?: number): string {
  const now = nowMs ?? Date.now();
  const diff = Math.max(0, now - timestampMs);

  if (!Number.isFinite(diff) || timestampMs <= 0) {
    return t('time.never');
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return t('time.justNow');
  if (seconds < 60) return t('time.secAgo', { n: seconds });

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minAgo', { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hrAgo', { n: hours });

  const days = Math.floor(hours / 24);
  return t('time.dayAgo', { n: days });
}

export function isStale(timestampMs: number, staleMs: number): boolean {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return true;
  return Date.now() - timestampMs > staleMs;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  return (parts[0]?.[0] ?? '')
    .concat(parts[parts.length - 1]?.[0] ?? '')
    .toUpperCase();
}
