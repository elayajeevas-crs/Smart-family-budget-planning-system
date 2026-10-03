import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { processDueRecurring } from '../services/recurring.service';
import { syncNotifications } from '../services/notification.service';
import { fetchRange, getBudgetView, inRange, monthlySeries, sum, sumByKey } from '../services/stats.service';
import { currentYearMonth, localToday } from '../utils/clock';
import { asyncHandler } from '../utils/asyncHandler';
import {
  type Frequency,
  type PaymentStatusValue,
  addMonths,
  monthRange,
  monthSlots,
  monthlyEquivalent,
  paymentState,
  percentage,
  resolveRange,
  round2,
  savingsMetrics,
  type RangeKey,
} from '../utils/finance';
import { generateInsights } from '../utils/insights';
import { num } from '../utils/serialize';

function distribution(map: Record<string, number>) {
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount: round2(amount), percent: percentage(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

export const getDashboard = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const cur = currentYearMonth();
  const q = req.query as { month?: number; year?: number };
  const month = q.month ?? cur.month;
  const year = q.year ?? cur.year;

  await processDueRecurring(c.familyId);
  await syncNotifications(c.familyId);

  const { start, end } = monthRange(year, month);
  const prevStart = addMonths(start, -1, 1);
  const windowStart = addMonths(start, -11, 1);
  const today = localToday();

  const [range, unpaid, goals, recurring, recentIncome, recentExpense, alerts] = await Promise.all([
    fetchRange(c.familyId, windowStart, end),
    prisma.payment.findMany({
      where: { familyId: c.familyId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.savingsGoal.findMany({ where: { familyId: c.familyId }, select: { currentAmount: true, targetAmount: true } }),
    prisma.recurringExpense.findMany({ where: { familyId: c.familyId, isActive: true } }),
    prisma.income.findMany({
      where: { familyId: c.familyId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      include: { member: { include: { user: { select: { name: true } } } } },
    }),
    prisma.expense.findMany({
      where: { familyId: c.familyId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      include: { member: { include: { user: { select: { name: true } } } } },
    }),
    prisma.notification.findMany({
      where: { userId: c.userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const curIncomes = inRange(range.incomes, start, end);
  const curExpenses = inRange(range.expenses, start, end);
  const prevExpenses = inRange(range.expenses, prevStart, start);
  const spend = sumByKey(curExpenses, (e) => e.category);
  const prevSpend = sumByKey(prevExpenses, (e) => e.category);
  const metrics = savingsMetrics(sum(curIncomes), sum(curExpenses));
  const budget = await getBudgetView(c.familyId, year, month, spend);

  const unpaidStates = unpaid.map((p) => ({
    ...p,
    amount: num(p.amount),
    ...paymentState(p.status as PaymentStatusValue, p.dueDate, today),
  }));
  const recurringMonthly = round2(recurring.reduce((s, r) => s + monthlyEquivalent(num(r.amount), r.frequency as Frequency), 0));

  const series = monthlySeries(range.incomes, range.expenses, monthSlots(windowStart, end));

  const recent = [
    ...recentIncome.map((r) => ({
      id: r.id,
      type: 'INCOME' as const,
      date: r.date,
      category: r.category as string,
      description: r.source,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
    })),
    ...recentExpense.map((r) => ({
      id: r.id,
      type: 'EXPENSE' as const,
      date: r.date,
      category: r.category as string,
      description: r.description,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  const insights = generateInsights({
    income: metrics.income,
    expenses: metrics.expenses,
    categorySpend: spend,
    prevCategorySpend: prevSpend,
    prevExpenses: sum(prevExpenses),
    budgetLines: budget
      ? [
          { category: 'OVERALL', ...budget.total },
          ...budget.categories.map((x) => ({ category: x.category, amount: x.amount, spent: x.spent, percentUsed: x.percentUsed, status: x.status })),
        ]
      : [],
    recurringMonthly,
  });

  res.json({
    period: { month, year },
    summary: {
      totalIncome: metrics.income,
      totalExpenses: metrics.expenses,
      remainingBalance: metrics.balance,
      totalSavings: metrics.savings,
      savingsRate: metrics.savingsRate,
      expenseToIncomeRatio: metrics.expenseToIncomeRatio,
      monthlyBudget: budget?.total.amount ?? 0,
      budgetUsed: budget?.total.spent ?? metrics.expenses,
      budgetRemaining: budget?.total.remaining ?? 0,
      budgetUsedPercent: budget?.total.percentUsed ?? 0,
      budgetStatus: budget?.total.status ?? null,
      hasBudget: Boolean(budget),
      pendingPayments: {
        count: unpaidStates.length,
        amount: round2(unpaidStates.reduce((s, p) => s + p.amount, 0)),
        overdueCount: unpaidStates.filter((p) => p.dueState === 'OVERDUE').length,
      },
      goalsSaved: round2(goals.reduce((s, g) => s + num(g.currentAmount), 0)),
      goalsTarget: round2(goals.reduce((s, g) => s + num(g.targetAmount), 0)),
    },
    charts: {
      incomeVsExpenses: series.slice(-6),
      expenseByCategory: distribution(spend),
      spendingTrend: series.map((s) => ({ label: s.label, expenses: s.expenses })),
      savingsTrend: series.map((s) => ({ label: s.label, savings: s.savings })),
      budgetVsActual: budget ? budget.categories.map((x) => ({ category: x.category, budget: x.amount, actual: x.spent })) : [],
    },
    budget,
    recentTransactions: recent,
    upcomingPayments: unpaidStates.slice(0, 5).map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      dueDate: p.dueDate,
      category: p.category,
      dueState: p.dueState,
      daysUntilDue: p.daysUntilDue,
    })),
    alerts,
    insights,
  });
});

interface RangeQuery {
  range: RangeKey;
  from?: Date;
  to?: Date;
}

export const getMonthly = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const { incomes, expenses } = await fetchRange(c.familyId, r.start, r.end);
  const data = monthlySeries(incomes, expenses, monthSlots(r.start, r.end));
  res.json({
    range: { key: r.key, start: r.start, end: r.end },
    data,
    totals: savingsMetrics(sum(incomes), sum(expenses)),
  });
});

export const getCategories = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const { incomes, expenses } = await fetchRange(c.familyId, r.start, r.end);
  const spend = sumByKey(expenses, (e) => e.category);

  const slots = monthSlots(r.start, r.end);
  const budgets = await prisma.budget.findMany({
    where: { familyId: c.familyId, OR: slots.map((s) => ({ year: Number(s.key.slice(0, 4)), month: Number(s.key.slice(5, 7)) })) },
    include: { categories: true },
  });
  const planned: Record<string, number> = {};
  for (const b of budgets) for (const cat of b.categories) planned[cat.category] = (planned[cat.category] ?? 0) + num(cat.amount);
  const keys = Array.from(new Set([...Object.keys(planned), ...Object.keys(spend)]));

  res.json({
    range: { key: r.key, start: r.start, end: r.end },
    expenses: distribution(spend),
    income: distribution(sumByKey(incomes, (i) => i.category)),
    budgetVsActual: keys
      .map((category) => ({ category, budget: round2(planned[category] ?? 0), actual: round2(spend[category] ?? 0) }))
      .sort((a, b) => b.actual - a.actual),
  });
});

export const getCashflow = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as RangeQuery;
  const r = resolveRange(q.range, localToday(), q.from, q.to);
  const { incomes, expenses } = await fetchRange(c.familyId, r.start, r.end);
  const series = monthlySeries(incomes, expenses, monthSlots(r.start, r.end));
  let running = 0;
  const data = series.map((s) => {
    running = round2(running + s.savings);
    return { key: s.key, label: s.label, inflow: s.income, outflow: s.expenses, net: s.savings, cumulative: running };
  });
  res.json({ range: { key: r.key, start: r.start, end: r.end }, data });
});
