import { NUMBER_THRESHOLDS } from './constants';

export function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  if (Math.abs(num) >= NUMBER_THRESHOLDS.BILLION) return (num / NUMBER_THRESHOLDS.BILLION).toFixed(2) + 'B';
  if (Math.abs(num) >= NUMBER_THRESHOLDS.MILLION) return (num / NUMBER_THRESHOLDS.MILLION).toFixed(1) + 'M';
  if (Math.abs(num) >= NUMBER_THRESHOLDS.THOUSAND) return (num / NUMBER_THRESHOLDS.THOUSAND).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Human-friendly relative time, e.g. "2 hours ago", "yesterday", "3 days ago".
 * Accepts an ISO timestamp string or Date. Returns "" if input is falsy.
 */
export function formatRelativeTime(input) {
  if (!input) return '';
  const then = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 30) return `${day} days ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.round(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/**
 * Compact relative time for tight UI labels, e.g. "4m ago", "2h ago", "3d ago".
 * Returns "" if input is falsy or unparseable.
 */
export function formatRelativeTimeShort(input) {
  if (!input) return '';
  const then = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(then.getTime())) return '';
  const min = Math.max(1, Math.round((Date.now() - then.getTime()) / 60000));
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
