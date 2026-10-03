import { env } from '../config/env';
import { startOfUtcDay } from './finance';

/**
 * "Today" according to the configured timezone offset, expressed as a UTC-midnight Date.
 * Dates in the database are stored as UTC midnight, so this is directly comparable.
 */
export function localToday(now: Date = new Date()): Date {
  return startOfUtcDay(new Date(now.getTime() + env.TZ_OFFSET_MINUTES * 60_000));
}

export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  const t = localToday(now);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}
