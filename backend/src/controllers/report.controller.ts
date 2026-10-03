import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { fetchRange, getBudgetView, sum, sumByKey } from '../services/stats.service';
import { currentYearMonth, localToday } from '../utils/clock';
import { asyncHandler } from '../utils/asyncHandler';
import {
  type RangeKey,
  addMonths,
  goalProgress,
  monthRange,
  monthSlots,
  percentage,
  resolveRange,
  round2,
  savingsMetrics,
} from '../utils/finance';
import { num } from '../utils/serialize';

const memberInclude = { member: { include: { user: { select: { name: true } } } } };

function share(map: Record<string, number>) {
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map)
    .map(([key, amount]) => ({ key, amount: round2(amount), percent: percentage(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

function monthlyTotals(rows: Array<{ date: Date; amount: number }>, slots: ReturnType<typeof monthSlots>) {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 7);
    totals[key] = round2((totals[key] ?? 0) + r.amount);
  }
  return slots.map((s) => ({ label: s.label, amount: totals[s.key] ?? 0 }));
}

async function loadRows(familyId: string, start: Date, end: Date) {
  const where = { familyId, date: { gte: start, lt: end } };
  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({ where, orderBy: { date: 'desc' }, take: 2000, include: memberInclude }),
    prisma.expense.findMany({ where, orderBy: { date: 'desc' }, take: 2000, include: memberInclude }),
  ]);
  return {
    incomes: incomes.map((r) => ({
      id: r.id,
      date: r.date,
      source: r.source,
      category: r.category as string,
      description: r.description,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
      isRecurring: r.isRecurring,
    })),
    expenses: expenses.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      category: r.category as string,
      paymentMethod: r.paymentMethod as string,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
      isRecurring: r.isRecurring,
    })),
  };
}

function byMember(rows: Array<{ memberName: string | null; amount: number }>) {
  return share(sumByKey(rows, (r) => r.memberName ?? 'Unassigned'));
}

export const monthlyReport = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const cur = currentYearMonth();
  const q = req.query as { month?: number; year?: number };
  const month = q.month ?? cur.month;
  const year = q.year ?? cur.year;
  const { start, end } = monthRange(year, month);
  const prevStart = addMonths(start, -1, 1);

  const [rows, prev, goals] = await Promise.all([
    loadRows(c.familyId, start, end),
    fetchRange(c.familyId, prevStart, start),
    prisma.savingsGoal.findMany({ where: { familyId: c.familyId } }),
  ]);
  const spend = sumByKey(rows.expenses, (e) => e.category);
  const budget = await getBudgetView(c.familyId, year, month, spend);
  const metrics = savingsMetrics(sum(rows.incomes), sum(rows.expenses));
  const today = localToday();

  const daily: Record<string, number> = {};
  for (const e of rows.expenses) {
    const key = e.date.toISOString().slice(8, 10);
    daily[key] = round2((daily[key] ?? 0) + e.amount);
  }

  res.json({
    period: { month, year },
    summary: { ...metrics, previousMonthExpenses: sum(prev.expenses), previousMonthIncome: sum(prev.incomes) },
    expensesByCategory: share(spend),
    incomeByCategory: share(sumByKey(rows.incomes, (i) => i.category)),
    dailySpending: Object.entries(daily)
      .map(([day, amount]) => ({ day, amount }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    budget,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: num(g.targetAmount),
      currentAmount: num(g.currentAmount),
      ...goalProgress(
        { targetAmount: num(g.targetAmount), currentAmount: num(g.currentAmount), targetDate: g.targetDate, createdAt: g.createdAt },
        today,
      ),
    })),
    topExpenses: [...rows.expenses].sort((a, b) => b.amount - a.amount).slice(0, 10),
    incomes: rows.incomes,
    expenses: rows.expenses,
  });
});

interface RangeQuery {
  range: RangeKey;
  from?: Date;
  to?: Date;
}

export const expenseReport = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const rows = await loadRows(c.familyId, r.start, r.end);
  res.json({
    range: { key: r.key, start: r.start, end: r.end },
    total: sum(rows.expenses),
    count: rows.expenses.length,
    average: round2(rows.expenses.length ? sum(rows.expenses) / rows.expenses.length : 0),
    byCategory: share(sumByKey(rows.expenses, (e) => e.category)),
    byMember: byMember(rows.expenses),
    byPaymentMethod: share(sumByKey(rows.expenses, (e) => e.paymentMethod)),
    monthly: monthlyTotals(rows.expenses, monthSlots(r.start, r.end)),
    rows: rows.expenses,
  });
});

export const incomeReport = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const rows = await loadRows(c.familyId, r.start, r.end);
  res.json({
    range: { key: r.key, start: r.start, end: r.end },
    total: sum(rows.incomes),
    count: rows.incomes.length,
    average: round2(rows.incomes.length ? sum(rows.incomes) / rows.incomes.length : 0),
    byCategory: share(sumByKey(rows.incomes, (i) => i.category)),
    byMember: byMember(rows.incomes),
    monthly: monthlyTotals(rows.incomes, monthSlots(r.start, r.end)),
    rows: rows.incomes,
  });
});

export const budgetReport = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const cur = currentYearMonth();
  const q = req.query as { month?: number; year?: number };
  const month = q.month ?? cur.month;
  const year = q.year ?? cur.year;

  const history = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = addMonths(new Date(Date.UTC(year, month - 1, 1)), -i, 1);
    const view = await getBudgetView(c.familyId, d.getUTCFullYear(), d.getUTCMonth() + 1);
    history.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: monthSlots(d, addMonths(d, 1, 1))[0].label,
      budget: view?.total.amount ?? 0,
      spent: view?.total.spent ?? 0,
      percentUsed: view?.total.percentUsed ?? 0,
      status: view?.total.status ?? null,
    });
  }
  res.json({ period: { month, year }, budget: await getBudgetView(c.familyId, year, month), history });
});

export const savingsReport = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const today = localToday();
  const [goals, contributions] = await Promise.all([
    prisma.savingsGoal.findMany({ where: { familyId: c.familyId }, orderBy: { targetDate: 'asc' } }),
    prisma.savingsContribution.findMany({
      where: { goal: { familyId: c.familyId }, date: { gte: r.start, lt: r.end } },
      orderBy: { date: 'desc' },
      include: { goal: { select: { name: true } }, user: { select: { name: true } } },
    }),
  ]);
  const slots = monthSlots(r.start, r.end);
  const perMonth: Record<string, number> = {};
  for (const x of contributions) {
    const key = x.date.toISOString().slice(0, 7);
    perMonth[key] = round2((perMonth[key] ?? 0) + num(x.amount));
  }
  res.json({
    range: { key: r.key, start: r.start, end: r.end },
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      targetDate: g.targetDate,
      targetAmount: num(g.targetAmount),
      currentAmount: num(g.currentAmount),
      ...goalProgress(
        { targetAmount: num(g.targetAmount), currentAmount: num(g.currentAmount), targetDate: g.targetDate, createdAt: g.createdAt },
        today,
      ),
    })),
    totalContributed: round2(contributions.reduce((s, x) => s + num(x.amount), 0)),
    monthly: slots.map((s) => ({ label: s.label, amount: perMonth[s.key] ?? 0 })),
    contributions: contributions.map((x) => ({
      id: x.id,
      date: x.date,
      goalName: x.goal.name,
      userName: x.user.name,
      amount: num(x.amount),
      note: x.note,
    })),
  });
});
