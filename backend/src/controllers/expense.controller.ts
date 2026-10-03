import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { type Ctx, assertCanModify, ctx } from '../middleware/auth';
import type { ExpenseInput, ExpenseListQuery } from '../validators/expense';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { round2 } from '../utils/finance';
import { paginate } from '../validators/common';
import { num } from '../utils/serialize';
import { resolveMemberId } from './income.controller';

const include = {
  member: { include: { user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

type Row = Prisma.ExpenseGetPayload<{ include: typeof include }>;

function toDto(row: Row, c: Ctx) {
  const { member, createdBy, ...rest } = row;
  return {
    ...rest,
    amount: num(rest.amount),
    memberName: member?.user?.name ?? null,
    createdByName: createdBy?.name ?? null,
    canEdit: c.isAdmin || rest.createdById === c.userId,
  };
}

export const listExpenses = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as ExpenseListQuery;
  const where: Prisma.ExpenseWhereInput = { familyId: c.familyId };
  if (q.category) where.category = q.category;
  if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
  if (q.memberId) where.memberId = q.memberId;
  if (q.isRecurring !== undefined) where.isRecurring = q.isRecurring;
  if (q.dateFrom || q.dateTo) where.date = { ...(q.dateFrom ? { gte: q.dateFrom } : {}), ...(q.dateTo ? { lte: q.dateTo } : {}) };
  if (q.search) {
    where.OR = [
      { description: { contains: q.search, mode: 'insensitive' } },
      { notes: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  const dir = q.sortOrder;
  const orderBy: Prisma.ExpenseOrderByWithRelationInput[] = [
    q.sortBy === 'amount' ? { amount: dir } : q.sortBy === 'category' ? { category: dir } : q.sortBy === 'createdAt' ? { createdAt: dir } : { date: dir },
    { createdAt: 'desc' },
  ];

  const [rows, total, amounts] = await Promise.all([
    prisma.expense.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, include }),
    prisma.expense.count({ where }),
    prisma.expense.findMany({ where, select: { amount: true } }),
  ]);

  res.json({
    data: rows.map((r) => toDto(r, c)),
    pagination: paginate(total, q.page, q.limit),
    summary: { totalAmount: round2(amounts.reduce((s, r) => s + num(r.amount), 0)) },
  });
});

export const getExpense = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const row = await prisma.expense.findFirst({ where: { id: req.params.id, familyId: c.familyId }, include });
  if (!row) throw new AppError(404, 'Expense not found');
  res.json({ expense: toDto(row, c) });
});

export const createExpense = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as ExpenseInput;
  const memberId = await resolveMemberId(c, b.memberId);
  const row = await prisma.expense.create({
    data: {
      familyId: c.familyId,
      createdById: c.userId,
      memberId,
      amount: b.amount,
      category: b.category,
      description: b.description,
      date: b.date,
      paymentMethod: b.paymentMethod,
      isRecurring: b.isRecurring,
      notes: b.notes,
    },
    include,
  });
  res.status(201).json({ expense: toDto(row, c) });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as ExpenseInput;
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Expense not found');
  assertCanModify(c, existing.createdById);
  const memberId = b.memberId ? await resolveMemberId(c, b.memberId) : existing.memberId;
  const row = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      memberId,
      amount: b.amount,
      category: b.category,
      description: b.description,
      date: b.date,
      paymentMethod: b.paymentMethod,
      isRecurring: b.isRecurring,
      notes: b.notes,
    },
    include,
  });
  res.json({ expense: toDto(row, c) });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Expense not found');
  assertCanModify(c, existing.createdById);
  await prisma.expense.delete({ where: { id: existing.id } });
  res.json({ message: 'Expense deleted' });
});
