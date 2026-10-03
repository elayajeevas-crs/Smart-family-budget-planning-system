import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { type Ctx, assertCanModify, ctx } from '../middleware/auth';
import type { IncomeInput, IncomeListQuery } from '../validators/income';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { round2 } from '../utils/finance';
import { paginate } from '../validators/common';
import { num } from '../utils/serialize';

const include = {
  member: { include: { user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.IncomeInclude;

type Row = Prisma.IncomeGetPayload<{ include: typeof include }>;

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

/** Resolves which family member a record belongs to, enforcing role rules. */
export async function resolveMemberId(c: Ctx, requested?: string | null): Promise<string> {
  if (!requested || requested === c.memberId) return c.memberId;
  if (!c.isAdmin) throw new AppError(403, 'Only admins can record entries for other members', 'FORBIDDEN');
  const target = await prisma.familyMember.findFirst({ where: { id: requested, familyId: c.familyId } });
  if (!target) throw new AppError(400, 'Selected family member does not exist');
  return target.id;
}

export const listIncome = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as IncomeListQuery;
  const where: Prisma.IncomeWhereInput = { familyId: c.familyId };
  if (q.category) where.category = q.category;
  if (q.memberId) where.memberId = q.memberId;
  if (q.isRecurring !== undefined) where.isRecurring = q.isRecurring;
  if (q.dateFrom || q.dateTo) where.date = { ...(q.dateFrom ? { gte: q.dateFrom } : {}), ...(q.dateTo ? { lte: q.dateTo } : {}) };
  if (q.search) {
    where.OR = [
      { source: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  const dir = q.sortOrder;
  const orderBy: Prisma.IncomeOrderByWithRelationInput[] = [
    q.sortBy === 'amount' ? { amount: dir } : q.sortBy === 'category' ? { category: dir } : q.sortBy === 'createdAt' ? { createdAt: dir } : { date: dir },
    { createdAt: 'desc' },
  ];

  const [rows, total, amounts] = await Promise.all([
    prisma.income.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, include }),
    prisma.income.count({ where }),
    prisma.income.findMany({ where, select: { amount: true } }),
  ]);

  res.json({
    data: rows.map((r) => toDto(r, c)),
    pagination: paginate(total, q.page, q.limit),
    summary: { totalAmount: round2(amounts.reduce((s, r) => s + num(r.amount), 0)) },
  });
});

export const getIncome = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const row = await prisma.income.findFirst({ where: { id: req.params.id, familyId: c.familyId }, include });
  if (!row) throw new AppError(404, 'Income record not found');
  res.json({ income: toDto(row, c) });
});

export const createIncome = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as IncomeInput;
  const memberId = await resolveMemberId(c, b.memberId);
  const row = await prisma.income.create({
    data: {
      familyId: c.familyId,
      createdById: c.userId,
      memberId,
      amount: b.amount,
      source: b.source,
      category: b.category,
      date: b.date,
      description: b.description,
      isRecurring: b.isRecurring,
      frequency: b.isRecurring ? b.frequency : null,
    },
    include,
  });
  res.status(201).json({ income: toDto(row, c) });
});

export const updateIncome = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as IncomeInput;
  const existing = await prisma.income.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Income record not found');
  assertCanModify(c, existing.createdById);
  const memberId = b.memberId ? await resolveMemberId(c, b.memberId) : existing.memberId;
  const row = await prisma.income.update({
    where: { id: existing.id },
    data: {
      memberId,
      amount: b.amount,
      source: b.source,
      category: b.category,
      date: b.date,
      description: b.description,
      isRecurring: b.isRecurring,
      frequency: b.isRecurring ? b.frequency : null,
    },
    include,
  });
  res.json({ income: toDto(row, c) });
});

export const deleteIncome = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.income.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Income record not found');
  assertCanModify(c, existing.createdById);
  await prisma.income.delete({ where: { id: existing.id } });
  res.json({ message: 'Income deleted' });
});
