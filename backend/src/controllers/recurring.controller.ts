import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { processDueRecurring } from '../services/recurring.service';
import { localToday } from '../utils/clock';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { type Frequency, daysBetween, monthlyEquivalent, round2 } from '../utils/finance';
import { num } from '../utils/serialize';

type Body = {
  name: string;
  amount: number;
  frequency: Frequency;
  nextDueDate: Date;
  category: 'FOOD' | 'GROCERIES' | 'HOUSING' | 'ELECTRICITY' | 'WATER' | 'INTERNET' | 'TRANSPORTATION' | 'EDUCATION' | 'HEALTHCARE' | 'SHOPPING' | 'ENTERTAINMENT' | 'EMI_LOAN' | 'INSURANCE' | 'BILLS' | 'OTHER';
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  autoCreateExpense: boolean;
  reminderDays: number;
  isActive: boolean;
};

function toDto<T extends { amount: unknown; frequency: string; nextDueDate: Date }>(r: T) {
  const amount = num(r.amount);
  const today = localToday();
  return {
    ...r,
    amount,
    monthlyEquivalent: monthlyEquivalent(amount, r.frequency as Frequency),
    daysUntilDue: daysBetween(today, r.nextDueDate),
  };
}

export const listRecurring = asyncHandler(async (req, res) => {
  const c = ctx(req);
  await processDueRecurring(c.familyId);
  const rows = await prisma.recurringExpense.findMany({
    where: { familyId: c.familyId },
    orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
  });
  const data = rows.map(toDto);
  res.json({
    data,
    summary: {
      activeCount: data.filter((r) => r.isActive).length,
      monthlyTotal: round2(data.filter((r) => r.isActive).reduce((s, r) => s + r.monthlyEquivalent, 0)),
      dueSoon: data.filter((r) => r.isActive && r.daysUntilDue >= 0 && r.daysUntilDue <= r.reminderDays).length,
    },
  });
});

export const createRecurring = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as Body;
  const row = await prisma.recurringExpense.create({ data: { familyId: c.familyId, createdById: c.userId, ...b } });
  await processDueRecurring(c.familyId);
  res.status(201).json({ recurring: toDto(row) });
});

export const updateRecurring = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const b = req.body as Body;
  const existing = await prisma.recurringExpense.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Recurring expense not found');
  const row = await prisma.recurringExpense.update({ where: { id: existing.id }, data: b });
  await processDueRecurring(c.familyId);
  res.json({ recurring: toDto(row) });
});

export const deleteRecurring = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const existing = await prisma.recurringExpense.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!existing) throw new AppError(404, 'Recurring expense not found');
  await prisma.recurringExpense.delete({ where: { id: existing.id } });
  res.json({ message: 'Recurring expense deleted' });
});

export const processRecurringNow = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const created = await processDueRecurring(c.familyId);
  res.json({ created });
});
