import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { getBudgetView } from '../services/stats.service';
import { currentYearMonth } from '../utils/clock';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { num } from '../utils/serialize';
import type { BudgetInput } from '../validators/budget';

export const getBudgets = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const cur = currentYearMonth();
  const q = req.query as { month?: number; year?: number };
  const month = q.month ?? cur.month;
  const year = q.year ?? cur.year;

  const [budget, history] = await Promise.all([
    getBudgetView(c.familyId, year, month),
    prisma.budget.findMany({
      where: { familyId: c.familyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { id: true, month: true, year: true, totalAmount: true },
      take: 24,
    }),
  ]);
  res.json({
    month,
    year,
    budget,
    history: history.map((h) => ({ ...h, totalAmount: num(h.totalAmount) })),
  });
});

export const createBudget = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as BudgetInput;
  const exists = await prisma.budget.findUnique({
    where: { familyId_year_month: { familyId: c.familyId, year: b.year, month: b.month } },
  });
  if (exists) throw new AppError(409, 'A budget already exists for this month. Edit it instead.');

  const created = await prisma.budget.create({
    data: {
      familyId: c.familyId,
      month: b.month,
      year: b.year,
      totalAmount: b.totalAmount,
      categories: { create: b.categories.map((x) => ({ category: x.category, amount: x.amount })) },
    },
  });
  res.status(201).json({ budget: await getBudgetView(c.familyId, created.year, created.month) });
});

export const updateBudget = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as BudgetInput;
  const existing = await prisma.budget.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Budget not found');

  const clash = await prisma.budget.findUnique({
    where: { familyId_year_month: { familyId: c.familyId, year: b.year, month: b.month } },
  });
  if (clash && clash.id !== existing.id) throw new AppError(409, 'Another budget already exists for that month');

  await prisma.$transaction([
    prisma.budgetCategory.deleteMany({ where: { budgetId: existing.id } }),
    prisma.budget.update({
      where: { id: existing.id },
      data: {
        month: b.month,
        year: b.year,
        totalAmount: b.totalAmount,
        categories: { create: b.categories.map((x) => ({ category: x.category, amount: x.amount })) },
      },
    }),
  ]);
  res.json({ budget: await getBudgetView(c.familyId, b.year, b.month) });
});

export const deleteBudget = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.budget.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Budget not found');
  await prisma.budget.delete({ where: { id: existing.id } });
  res.json({ message: 'Budget deleted' });
});
