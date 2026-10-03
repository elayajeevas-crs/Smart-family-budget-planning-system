import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { localToday } from '../utils/clock';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { type PaymentStatusValue, paymentState, round2 } from '../utils/finance';
import { num } from '../utils/serialize';
import { paginate } from '../validators/common';

/** Keeps stored statuses aligned with due dates (PENDING <-> OVERDUE). */
export async function syncPaymentStatuses(familyId: string): Promise<void> {
  const today = localToday();
  await prisma.payment.updateMany({
    where: { familyId, status: 'PENDING', dueDate: { lt: today } },
    data: { status: 'OVERDUE' },
  });
  await prisma.payment.updateMany({
    where: { familyId, status: 'OVERDUE', dueDate: { gte: today } },
    data: { status: 'PENDING' },
  });
}

function toDto<T extends { amount: unknown; status: string; dueDate: Date }>(p: T) {
  const st = paymentState(p.status as PaymentStatusValue, p.dueDate, localToday());
  return { ...p, amount: num(p.amount), status: st.effectiveStatus, dueState: st.dueState, daysUntilDue: st.daysUntilDue };
}

type PaymentBody = {
  name: string;
  amount: number;
  dueDate: Date;
  category: 'FOOD' | 'GROCERIES' | 'HOUSING' | 'ELECTRICITY' | 'WATER' | 'INTERNET' | 'TRANSPORTATION' | 'EDUCATION' | 'HEALTHCARE' | 'SHOPPING' | 'ENTERTAINMENT' | 'EMI_LOAN' | 'INSURANCE' | 'BILLS' | 'OTHER';
  status?: 'PENDING' | 'PAID' | 'OVERDUE';
  notes: string | null;
};

export const listPayments = asyncHandler(async (req, res) => {
  const c = ctx(req);
  await syncPaymentStatuses(c.familyId);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    status?: 'PENDING' | 'PAID' | 'OVERDUE';
    dueState?: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE';
    category?: PaymentBody['category'];
    sortBy: 'dueDate' | 'amount' | 'name';
    sortOrder: 'asc' | 'desc';
  };
  const today = localToday();

  const where: Prisma.PaymentWhereInput = { familyId: c.familyId };
  if (q.status) where.status = q.status;
  if (q.category) where.category = q.category;
  if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
  if (q.dueState === 'OVERDUE') where.status = 'OVERDUE';
  if (q.dueState === 'DUE_TODAY') {
    where.status = 'PENDING';
    where.dueDate = today;
  }
  if (q.dueState === 'UPCOMING') {
    where.status = 'PENDING';
    where.dueDate = { gt: today };
  }
  const dir = q.sortOrder;
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] = [
    q.sortBy === 'amount' ? { amount: dir } : q.sortBy === 'name' ? { name: dir } : { dueDate: dir },
    { createdAt: 'desc' },
  ];

  const [rows, total, all] = await Promise.all([
    prisma.payment.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where: { familyId: c.familyId }, select: { amount: true, status: true, dueDate: true } }),
  ]);

  const states = all.map((p) => ({ amount: num(p.amount), ...paymentState(p.status as PaymentStatusValue, p.dueDate, today) }));
  const bucket = (s: string) => states.filter((x) => x.dueState === s);
  const total$ = (arr: { amount: number }[]) => round2(arr.reduce((s, x) => s + x.amount, 0));

  res.json({
    data: rows.map(toDto),
    pagination: paginate(total, q.page, q.limit),
    summary: {
      upcoming: { count: bucket('UPCOMING').length, amount: total$(bucket('UPCOMING')) },
      dueToday: { count: bucket('DUE_TODAY').length, amount: total$(bucket('DUE_TODAY')) },
      overdue: { count: bucket('OVERDUE').length, amount: total$(bucket('OVERDUE')) },
      paid: { count: bucket('PAID').length, amount: total$(bucket('PAID')) },
    },
  });
});

export const getPayment = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const row = await prisma.payment.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!row) throw new AppError(404, 'Payment not found');
  res.json({ payment: toDto(row) });
});

export const createPayment = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as PaymentBody;
  const paid = b.status === 'PAID';
  const row = await prisma.payment.create({
    data: {
      familyId: c.familyId,
      createdById: c.userId,
      name: b.name,
      amount: b.amount,
      dueDate: b.dueDate,
      category: b.category,
      notes: b.notes,
      status: paid ? 'PAID' : paymentState('PENDING', b.dueDate, localToday()).effectiveStatus,
      paidAt: paid ? new Date() : null,
    },
  });
  res.status(201).json({ payment: toDto(row) });
});

export const updatePayment = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as PaymentBody;
  const existing = await prisma.payment.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Payment not found');
  const paid = (b.status ?? existing.status) === 'PAID';
  const row = await prisma.payment.update({
    where: { id: existing.id },
    data: {
      name: b.name,
      amount: b.amount,
      dueDate: b.dueDate,
      category: b.category,
      notes: b.notes,
      status: paid ? 'PAID' : paymentState('PENDING', b.dueDate, localToday()).effectiveStatus,
      paidAt: paid ? existing.paidAt ?? new Date() : null,
    },
  });
  res.json({ payment: toDto(row) });
});

export const deletePayment = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.payment.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Payment not found');
  await prisma.payment.delete({ where: { id: existing.id } });
  res.json({ message: 'Payment deleted' });
});

export const markPaid = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as { recordExpense: boolean; paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER' };
  const existing = await prisma.payment.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Payment not found');
  if (existing.status === 'PAID') throw new AppError(400, 'This payment is already marked as paid');

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.payment.update({ where: { id: existing.id }, data: { status: 'PAID', paidAt: new Date() } }),
  ];
  if (b.recordExpense) {
    ops.push(
      prisma.expense.create({
        data: {
          familyId: c.familyId,
          createdById: c.userId,
          memberId: c.memberId,
          amount: existing.amount,
          category: existing.category,
          description: existing.name,
          date: localToday(),
          paymentMethod: b.paymentMethod,
          notes: 'Recorded when marking a pending payment as paid',
        },
      }),
    );
  }
  await prisma.$transaction(ops);
  const row = await prisma.payment.findUnique({ where: { id: existing.id } });
  res.json({ payment: toDto(row!), expenseRecorded: b.recordExpense });
});
