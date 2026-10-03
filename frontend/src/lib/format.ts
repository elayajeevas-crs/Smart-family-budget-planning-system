let locale = 'en-IN';

export function setNumberLocale(next: string) {
  locale = next;
}

export function formatCurrency(value: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const n = Number(value ?? 0);
  const decimals = opts.decimals ?? !Number.isInteger(n);
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(Math.abs(n));
  return `${n < 0 ? '-' : ''}₹${body}`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Plain-text money for PDFs (the default PDF fonts have no rupee glyph). */
export function formatPlainMoney(value: number): string {
  return `Rs. ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

/** yyyy-mm-dd for <input type="date"> */
export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthInput(): string {
  return todayInput().slice(0, 7);
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function relativeDue(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
