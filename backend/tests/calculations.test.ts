import { describe, expect, it } from 'vitest';
import {
  budgetLine,
  budgetStatus,
  goalProgress,
  monthSlots,
  monthlyEquivalent,
  nextDueDate,
  occurrencesUpTo,
  paymentState,
  pctChange,
  percentage,
  resolveRange,
  safeDivide,
  savingsMetrics,
} from '../src/utils/finance';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('safe math', () => {
  it('never divides by zero', () => {
    expect(safeDivide(5, 0)).toBe(0);
    expect(percentage(50, 0)).toBe(0);
    expect(pctChange(100, 0)).toBeNull();
  });
  it('computes percentages and changes', () => {
    expect(percentage(25, 200)).toBe(12.5);
    expect(pctChange(118, 100)).toBe(18);
    expect(pctChange(80, 100)).toBe(-20);
  });
});

describe('budget calculations', () => {
  it('maps usage to the documented status bands', () => {
    expect(budgetStatus(0)).toBe('SAFE');
    expect(budgetStatus(69.99)).toBe('SAFE');
    expect(budgetStatus(70)).toBe('WARNING');
    expect(budgetStatus(89.99)).toBe('WARNING');
    expect(budgetStatus(90)).toBe('CRITICAL');
    expect(budgetStatus(99.99)).toBe('CRITICAL');
    expect(budgetStatus(100)).toBe('EXCEEDED');
    expect(budgetStatus(140)).toBe('EXCEEDED');
  });

  it('calculates spent, remaining, percent used and status', () => {
    expect(budgetLine(8000, 2000)).toEqual({ amount: 8000, spent: 2000, remaining: 6000, percentUsed: 25, status: 'SAFE' });
    expect(budgetLine(2000, 1840)).toMatchObject({ percentUsed: 92, status: 'CRITICAL', remaining: 160 });
    expect(budgetLine(5000, 5450)).toMatchObject({ percentUsed: 109, status: 'EXCEEDED', remaining: -450 });
  });

  it('handles a zero budget safely', () => {
    expect(budgetLine(0, 0)).toMatchObject({ percentUsed: 0, status: 'SAFE' });
    expect(budgetLine(0, 100)).toMatchObject({ percentUsed: 100, status: 'EXCEEDED' });
  });
});

describe('income / expense / savings metrics', () => {
  it('computes balance, savings rate and expense-to-income ratio', () => {
    expect(savingsMetrics(100000, 79000)).toEqual({
      income: 100000,
      expenses: 79000,
      balance: 21000,
      savings: 21000,
      savingsRate: 21,
      expenseToIncomeRatio: 79,
    });
  });
  it('handles zero income and overspending', () => {
    expect(savingsMetrics(0, 500)).toMatchObject({ balance: -500, savingsRate: 0, expenseToIncomeRatio: 0 });
    expect(savingsMetrics(1000, 1500)).toMatchObject({ balance: -500, savingsRate: -50, expenseToIncomeRatio: 150 });
  });
});

describe('savings goal calculations', () => {
  const now = d('2026-10-02');
  it('computes progress, remaining and required monthly saving', () => {
    const g = goalProgress({ targetAmount: 120000, currentAmount: 36000, targetDate: d('2027-10-02'), createdAt: d('2026-04-02') }, now);
    expect(g.progressPercent).toBe(30);
    expect(g.remainingAmount).toBe(84000);
    expect(g.monthsLeft).toBe(12);
    expect(g.requiredMonthlySaving).toBe(7000);
    expect(g.status).toBe('ON_TRACK');
  });
  it('flags goals that are behind schedule', () => {
    const g = goalProgress({ targetAmount: 60000, currentAmount: 12000, targetDate: d('2027-01-02'), createdAt: d('2026-03-02') }, now);
    expect(g.status).toBe('BEHIND');
    expect(g.expectedPercent).toBeGreaterThan(g.progressPercent);
  });
  it('recognises completed and overdue goals and caps progress at 100%', () => {
    expect(goalProgress({ targetAmount: 1000, currentAmount: 1500, targetDate: d('2027-01-01'), createdAt: d('2026-01-01') }, now)).toMatchObject({
      status: 'COMPLETED',
      progressPercent: 100,
      remainingAmount: 0,
    });
    const overdue = goalProgress({ targetAmount: 1000, currentAmount: 100, targetDate: d('2026-09-01'), createdAt: d('2026-01-01') }, now);
    expect(overdue.status).toBe('OVERDUE');
    expect(overdue.monthsLeft).toBe(0);
    expect(overdue.requiredMonthlySaving).toBe(900);
  });
});

describe('payment status', () => {
  const now = new Date('2026-10-02T15:30:00Z');
  it('derives overdue / due today / upcoming / paid', () => {
    expect(paymentState('PENDING', d('2026-10-01'), now)).toMatchObject({ effectiveStatus: 'OVERDUE', dueState: 'OVERDUE', daysUntilDue: -1 });
    expect(paymentState('PENDING', d('2026-10-02'), now)).toMatchObject({ effectiveStatus: 'PENDING', dueState: 'DUE_TODAY' });
    expect(paymentState('PENDING', d('2026-10-09'), now)).toMatchObject({ effectiveStatus: 'PENDING', dueState: 'UPCOMING', daysUntilDue: 7 });
    expect(paymentState('PAID', d('2026-09-01'), now)).toMatchObject({ effectiveStatus: 'PAID', dueState: 'PAID' });
  });
  it('treats a stored OVERDUE payment with a future date as pending', () => {
    expect(paymentState('OVERDUE', d('2026-10-20'), now).effectiveStatus).toBe('PENDING');
  });
});

describe('recurring due-date calculation', () => {
  it('advances by each frequency', () => {
    expect(nextDueDate(d('2026-10-02'), 'WEEKLY').toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(nextDueDate(d('2026-10-15'), 'MONTHLY').toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(nextDueDate(d('2026-10-15'), 'QUARTERLY').toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(nextDueDate(d('2026-10-15'), 'YEARLY').toISOString()).toBe('2027-10-15T00:00:00.000Z');
  });
  it('clamps month-end dates and recovers the anchor day', () => {
    expect(nextDueDate(d('2026-01-31'), 'MONTHLY').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(nextDueDate(d('2026-02-28'), 'MONTHLY', 31).toISOString()).toBe('2026-03-31T00:00:00.000Z');
    expect(nextDueDate(d('2024-02-29'), 'YEARLY').toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });
  it('lists every missed occurrence and the next future date', () => {
    const r = occurrencesUpTo(d('2026-07-31'), 'MONTHLY', d('2026-10-01'));
    expect(r.occurrences.map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-07-31', '2026-08-31', '2026-09-30']);
    expect(r.next.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(occurrencesUpTo(d('2026-10-05'), 'MONTHLY', d('2026-10-01')).occurrences).toHaveLength(0);
  });
  it('normalises amounts to a monthly equivalent', () => {
    expect(monthlyEquivalent(1200, 'YEARLY')).toBe(100);
    expect(monthlyEquivalent(3000, 'QUARTERLY')).toBe(1000);
    expect(monthlyEquivalent(100, 'WEEKLY')).toBe(433.33);
  });
});

describe('date ranges', () => {
  const now = d('2026-10-02');
  it('resolves named ranges', () => {
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    const this_ = resolveRange('this_month', now);
    expect([iso(this_.start), iso(this_.end)]).toEqual(['2026-10-01', '2026-11-01']);
    const last = resolveRange('last_month', now);
    expect([iso(last.start), iso(last.end)]).toEqual(['2026-09-01', '2026-10-01']);
    const three = resolveRange('last_3_months', now);
    expect([iso(three.start), iso(three.end)]).toEqual(['2026-08-01', '2026-11-01']);
    const year = resolveRange('this_year', now);
    expect([iso(year.start), iso(year.end)]).toEqual(['2026-01-01', '2027-01-01']);
    const custom = resolveRange('custom', now, d('2026-03-10'), d('2026-04-20'));
    expect([iso(custom.start), iso(custom.end)]).toEqual(['2026-03-10', '2026-04-21']);
  });
  it('builds one slot per month', () => {
    expect(monthSlots(d('2026-08-01'), d('2026-11-01')).map((s) => s.label)).toEqual(['Aug 26', 'Sep 26', 'Oct 26']);
  });
});
