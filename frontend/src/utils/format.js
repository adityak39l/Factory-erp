/** Shared formatting helpers. All DPR dates are plain YYYY-MM-DD strings. */

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function isoToDisplay(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function isoToLongDisplay(iso) {
  if (!iso) return '—';
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dateTimeDisplay(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 9.33 -> "9h 20m" — much easier to read on a factory floor than a decimal. */
export function hoursDisplay(value) {
  if (value === null || value === undefined) return '—';
  const total = Math.round(Number(value) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export const numberDisplay = (value, suffix = '') =>
  value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-IN')}${suffix}`;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthOptions = MONTHS.map((label, index) => ({ value: index + 1, label }));

export function yearOptions(span = 5) {
  const current = new Date().getFullYear();
  return Array.from({ length: span }, (_, i) => current - span + 2 + i);
}

/** First and last day of a month as ISO strings. */
export function monthRangeIso(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
