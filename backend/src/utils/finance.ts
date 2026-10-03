/**
 * Pure financial calculation helpers (no I/O, no framework imports).
 * All dates are treated as UTC dates.
 */

export type BudgetStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';
export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type PaymentStatusValue = 'PENDING' | 'PAID' | 'OVERDUE';
export type DueState = 'PAID' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

const DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round1 = (n: number): number => Math.round((n + Number.EPSILON) * 10) / 10;

export function safeDivide(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  return a / b;
}

/** part / total * 100, rounded to 2 decimals, 0 when total is 0. */
export function percentage(part: number, total: number): number {
  return round2(safeDivide(part, total) * 100);
}

/** Percentage change from prev to cur. Returns null when there is no baseline. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return round1(((cur - prev) / prev) * 100);
}

// ---------- Budget ----------

/** <70 SAFE, 70-<90 WARNING, 90-<100 CRITICAL, >=100 EXCEEDED */
export function budgetStatus(percentUsed: number): BudgetStatus {
  if (percentUsed >= 100) return 'EXCEEDED';
  if (percentUsed >= 90) return 'CRITICAL';
  if (percentUsed >= 70) return 'WARNING';
  return 'SAFE';
}

export interface BudgetLine {
  amount: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetStatus;
}

export function budgetLine(amount: number, spent: number): BudgetLine {
  const percentUsed = amount <= 0 ? (spent > 0 ? 100 : 0) : percentage(spent, amount);
  return {
    amount: round2(amount),
    spent: round2(spent),
    remaining: round2(amount - spent),
    percentUsed,
    status: budgetStatus(percentUsed),
  };
}

// ---------- Income / expense metrics ----------

export interface SavingsMetrics {
  income: number;
  expenses: number;
  balance: number;
  savings: number;
  savingsRate: number;
  expenseToIncomeRatio: number;
}

export function savingsMetrics(income: number, expenses: number): SavingsMetrics {
  const balance = round2(income - expenses);
  return {
    income: round2(income),
    expenses: round2(expenses),
    balance,
    savings: balance,
    savingsRate: percentage(balance, income),
    expenseToIncomeRatio: percentage(expenses, income),
  };
}

// ---------- Savings goals ----------

export type GoalStatus = 'COMPLETED' | 'ON_TRACK' | 'BEHIND' | 'OVERDUE';

export interface GoalProgress {
  progressPercent: number;
  remainingAmount: number;
  monthsLeft: number;
  requiredMonthlySaving: number;
  expectedPercent: number;
  status: GoalStatus;
}

export function goalProgress(
  goal: { targetAmount: number; currentAmount: number; targetDate: Date; createdAt: Date },
  now: Date = new Date(),
): GoalProgress {
  const target = goal.targetAmount;
  const current = goal.currentAmount;
  const remainingAmount = round2(Math.max(0, target - current));
  const progressPercent = Math.min(100, percentage(current, target));

  const msLeft = goal.targetDate.getTime() - now.getTime();
  const monthsLeft = msLeft <= 0 ? 0 : Math.max(1, Math.ceil(msLeft / (DAY_MS * 30.4375)));
  const requiredMonthlySaving = monthsLeft > 0 ? round2(remainingAmount / monthsLeft) : remainingAmount;

  const total = goal.targetDate.getTime() - goal.createdAt.getTime();
  const elapsed = now.getTime() - goal.createdAt.getTime();
  const expectedFraction = total <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / total));
  const expectedPercent = round2(expectedFraction * 100);

  let status: GoalStatus = 'ON_TRACK';
  if (current >= target) status = 'COMPLETED';
  else if (msLeft <= 0) status = 'OVERDUE';
  else if (elapsed >= 30 * DAY_MS && progressPercent < expectedPercent * 0.8) status = 'BEHIND';

  return { progressPercent, remainingAmount, monthsLeft, requiredMonthlySaving, expectedPercent, status };
}

// ---------- Dates ----------

export const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** month is 1-12. Returns [start, end) range. */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Adds months, clamping the day to the target month's length (or keeping an anchor day). */
export function addMonths(d: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const clamped = Math.min(day, daysInMonth(year, month + 1));
  return new Date(Date.UTC(year, month, clamped));
}

export function nextDueDate(from: Date, frequency: Frequency, anchorDay?: number): Date {
  switch (frequency) {
    case 'WEEKLY':
      return addDays(from, 7);
    case 'MONTHLY':
      return addMonths(from, 1, anchorDay);
    case 'QUARTERLY':
      return addMonths(from, 3, anchorDay);
    case 'YEARLY':
      return addMonths(from, 12, anchorDay);
  }
}

/**
 * All occurrences that fall on or before `today`, plus the first future due date.
 * Used to auto-create missed recurring expenses.
 */
export function occurrencesUpTo(
  firstDue: Date,
  frequency: Frequency,
  today: Date,
  max = 24,
): { occurrences: Date[]; next: Date } {
  const anchor = firstDue.getUTCDate();
  const occurrences: Date[] = [];
  let cursor = startOfUtcDay(firstDue);
  while (cursor.getTime() <= today.getTime() && occurrences.length < max) {
    occurrences.push(cursor);
    cursor = nextDueDate(cursor, frequency, anchor);
  }
  // If we hit the cap, jump the cursor into the future so we never loop forever.
  while (cursor.getTime() <= today.getTime()) cursor = nextDueDate(cursor, frequency, anchor);
  return { occurrences, next: cursor };
}

/** Normalises any recurrence to an approximate monthly amount. */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'WEEKLY':
      return round2((amount * 52) / 12);
    case 'MONTHLY':
      return round2(amount);
    case 'QUARTERLY':
      return round2(amount / 3);
    case 'YEARLY':
      return round2(amount / 12);
  }
}

// ---------- Payments ----------

export function paymentState(
  status: PaymentStatusValue,
  dueDate: Date,
  now: Date = new Date(),
): { effectiveStatus: PaymentStatusValue; dueState: DueState; daysUntilDue: number } {
  const daysUntilDue = daysBetween(now, dueDate);
  if (status === 'PAID') return { effectiveStatus: 'PAID', dueState: 'PAID', daysUntilDue };
  if (daysUntilDue < 0) return { effectiveStatus: 'OVERDUE', dueState: 'OVERDUE', daysUntilDue };
  if (daysUntilDue === 0) return { effectiveStatus: 'PENDING', dueState: 'DUE_TODAY', daysUntilDue };
  return { effectiveStatus: 'PENDING', dueState: 'UPCOMING', daysUntilDue };
}

// ---------- Ranges ----------

export type RangeKey = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom';

/** Resolves a named range to a [start, end) window. */
export function resolveRange(
  range: RangeKey | undefined,
  now: Date,
  from?: Date,
  to?: Date,
): { start: Date; end: Date; key: RangeKey } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const thisMonth = monthRange(y, m);
  switch (range) {
    case 'last_month': {
      const start = addMonths(thisMonth.start, -1, 1);
      return { start, end: thisMonth.start, key: 'last_month' };
    }
    case 'last_3_months':
      return { start: addMonths(thisMonth.start, -2, 1), end: thisMonth.end, key: 'last_3_months' };
    case 'last_6_months':
      return { start: addMonths(thisMonth.start, -5, 1), end: thisMonth.end, key: 'last_6_months' };
    case 'this_year':
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)), key: 'this_year' };
    case 'custom':
      if (from && to && from.getTime() <= to.getTime()) {
        return { start: startOfUtcDay(from), end: addDays(startOfUtcDay(to), 1), key: 'custom' };
      }
      return { ...thisMonth, key: 'this_month' };
    default:
      return { ...thisMonth, key: 'this_month' };
  }
}

export interface MonthSlot {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One slot per calendar month overlapping [start, end). */
export function monthSlots(start: Date, end: Date): MonthSlot[] {
  const slots: MonthSlot[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let guard = 0;
  while (cursor.getTime() < end.getTime() && guard < 240) {
    const next = addMonths(cursor, 1, 1);
    slots.push({
      key: monthKey(cursor),
      label: `${MONTH_NAMES[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
      start: cursor,
      end: next,
    });
    cursor = next;
    guard += 1;
  }
  return slots;
}
