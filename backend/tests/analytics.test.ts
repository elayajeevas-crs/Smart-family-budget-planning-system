import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma', async () => {
  const { createFakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: createFakePrisma() };
});

import { inRange, monthlySeries, sum, sumByKey } from '../src/services/stats.service';
import { monthSlots } from '../src/utils/finance';
import { generateInsights } from '../src/utils/insights';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const inc = (date: string, amount: number, category = 'SALARY') => ({ id: date + amount, date: d(date), amount, category, memberId: null, source: 's', description: null });
const exp = (date: string, amount: number, category = 'FOOD') => ({ id: date + amount, date: d(date), amount, category, memberId: null, description: 'd', paymentMethod: 'UPI' });

describe('analytics aggregation', () => {
  const incomes = [inc('2026-08-01', 100000), inc('2026-09-01', 100000), inc('2026-09-15', 5000, 'BONUS'), inc('2026-10-01', 100000)];
  const expenses = [exp('2026-08-10', 60000), exp('2026-09-10', 70000), exp('2026-09-20', 5000, 'SHOPPING'), exp('2026-10-02', 30000)];

  it('builds monthly income / expense / savings series', () => {
    const series = monthlySeries(incomes, expenses, monthSlots(d('2026-08-01'), d('2026-11-01')));
    expect(series.map((s) => [s.label, s.income, s.expenses, s.savings])).toEqual([
      ['Aug 26', 100000, 60000, 40000],
      ['Sep 26', 105000, 75000, 30000],
      ['Oct 26', 100000, 30000, 70000],
    ]);
  });

  it('filters by range and groups by category', () => {
    const sep = inRange(expenses, d('2026-09-01'), d('2026-10-01'));
    expect(sum(sep)).toBe(75000);
    expect(sumByKey(sep, (e) => e.category)).toEqual({ FOOD: 70000, SHOPPING: 5000 });
  });

  it('returns zeros (not NaN) for empty months', () => {
    const [only] = monthlySeries([], [], monthSlots(d('2026-01-01'), d('2026-02-01')));
    expect(only).toMatchObject({ income: 0, expenses: 0, savings: 0 });
  });
});

describe('dynamic insights', () => {
  const base = {
    income: 100000,
    expenses: 79000,
    categorySpend: { FOOD: 9440, TRANSPORTATION: 20000, ENTERTAINMENT: 18400, SHOPPING: 2000, EMI_LOAN: 31000 },
    prevCategorySpend: { FOOD: 8000, TRANSPORTATION: 19000, ENTERTAINMENT: 18000 },
    prevExpenses: 70000,
    budgetLines: [
      { category: 'ENTERTAINMENT', amount: 20000, spent: 18400, percentUsed: 92, status: 'CRITICAL' as const },
      { category: 'SHOPPING', amount: 1500, spent: 2000, percentUsed: 133.33, status: 'EXCEEDED' as const },
    ],
    recurringMonthly: 25000,
  };

  it('derives every statement from the numbers', () => {
    const msgs = generateInsights(base).map((i) => i.message);
    expect(msgs.some((m) => m.startsWith('EMI / Loan is your highest expense category'))).toBe(true);
    expect(msgs).toContain('Food spending increased by 18% compared with last month.');
    expect(msgs).toContain('You have used 92% of your Entertainment budget.');
    expect(msgs.some((m) => m.includes('exceeded your Shopping budget by ₹500'))).toBe(true);
    expect(msgs).toContain('Your current savings rate is 21%. You are on a healthy path.');
    expect(msgs.some((m) => m.includes('Recurring expenses') && m.includes('25%'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('Your total spending is up 12.9%'))).toBe(true);
  });

  it('changes when the data changes', () => {
    const msgs = generateInsights({ ...base, expenses: 120000, prevExpenses: 130000 }).map((i) => i.message);
    expect(msgs.some((m) => m.includes('spent ₹20,000 more than you earned'))).toBe(true);
    expect(msgs.some((m) => m.includes('spending is down 7.7%'))).toBe(true);
    expect(msgs.some((m) => m.includes('savings rate is 21%'))).toBe(false);
  });

  it('flags heavy EMI burden and handles empty data', () => {
    expect(generateInsights(base).some((i) => i.type === 'debt')).toBe(true);
    const empty = generateInsights({ income: 0, expenses: 0, categorySpend: {}, prevCategorySpend: {}, prevExpenses: 0, budgetLines: [], recurringMonthly: 0 });
    expect(empty).toHaveLength(1);
    expect(empty[0].type).toBe('getting-started');
  });
});
