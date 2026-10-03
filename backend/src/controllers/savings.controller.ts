import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { localToday } from '../utils/clock';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { goalProgress, round2 } from '../utils/finance';
import { num } from '../utils/serialize';

interface GoalRow {
  id: string;
  targetAmount: unknown;
  currentAmount: unknown;
  targetDate: Date;
  createdAt: Date;
}

function withProgress<T extends GoalRow>(g: T) {
  const prog = goalProgress(
    { targetAmount: num(g.targetAmount), currentAmount: num(g.currentAmount), targetDate: g.targetDate, createdAt: g.createdAt },
    localToday(),
  );
  return { ...g, targetAmount: num(g.targetAmount), currentAmount: num(g.currentAmount), ...prog };
}

export const listGoals = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const goals = await prisma.savingsGoal.findMany({ where: { familyId: c.familyId }, orderBy: { targetDate: 'asc' } });
  const data = goals.map(withProgress);
  res.json({
    data,
    summary: {
      totalTarget: round2(data.reduce((s, g) => s + g.targetAmount, 0)),
      totalSaved: round2(data.reduce((s, g) => s + g.currentAmount, 0)),
      completed: data.filter((g) => g.status === 'COMPLETED').length,
      behind: data.filter((g) => g.status === 'BEHIND' || g.status === 'OVERDUE').length,
    },
  });
});

export const getGoal = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const goal = await prisma.savingsGoal.findFirst({
    where: { id: req.params.id, familyId: c.familyId },
    include: {
      contributions: { orderBy: { date: 'desc' }, take: 50, include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!goal) throw new AppError(404, 'Savings goal not found');
  const { contributions, ...rest } = goal;
  res.json({
    goal: {
      ...withProgress(rest),
      contributions: contributions.map((x) => ({
        id: x.id,
        amount: num(x.amount),
        date: x.date,
        note: x.note,
        userName: x.user?.name ?? null,
      })),
    },
  });
});

export const createGoal = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as {
    name: string;
    category: 'EMERGENCY_FUND' | 'LAPTOP' | 'EDUCATION' | 'VACATION' | 'VEHICLE' | 'HOUSE' | 'OTHER';
    targetAmount: number;
    currentAmount: number;
    targetDate: Date;
    description: string | null;
  };
  const goal = await prisma.savingsGoal.create({ data: { familyId: c.familyId, ...b } });
  res.status(201).json({ goal: withProgress(goal) });
});

export const updateGoal = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as {
    name: string;
    category: 'EMERGENCY_FUND' | 'LAPTOP' | 'EDUCATION' | 'VACATION' | 'VEHICLE' | 'HOUSE' | 'OTHER';
    targetAmount: number;
    currentAmount: number;
    targetDate: Date;
    description: string | null;
  };
  const existing = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Savings goal not found');
  const goal = await prisma.savingsGoal.update({ where: { id: existing.id }, data: b });
  res.json({ goal: withProgress(goal) });
});

export const deleteGoal = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Savings goal not found');
  await prisma.savingsGoal.delete({ where: { id: existing.id } });
  res.json({ message: 'Savings goal deleted' });
});

export const contribute = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as { amount: number; date?: Date; note: string | null };
  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!goal) throw new AppError(404, 'Savings goal not found');

  await prisma.$transaction([
    prisma.savingsContribution.create({
      data: { goalId: goal.id, userId: c.userId, amount: b.amount, date: b.date ?? localToday(), note: b.note },
    }),
    prisma.savingsGoal.update({ where: { id: goal.id }, data: { currentAmount: { increment: b.amount } } }),
  ]);
  const updated = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
  res.status(201).json({ goal: withProgress(updated!) });
});
