import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ctx } from '../middleware/auth';
import { localToday } from '../utils/clock';
import { asyncHandler } from '../utils/asyncHandler';
import { round2 } from '../utils/finance';
import { num } from '../utils/serialize';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, paginate } from '../validators/common';

interface Query {
  page: number;
  limit: number;
  search?: string;
  type?: 'INCOME' | 'EXPENSE';
  category?: string;
  paymentMethod?: string;
  memberId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: 'date' | 'amount' | 'category' | 'type';
  sortOrder: 'asc' | 'desc';
}

/** Unified income + expense history. */
export const listTransactions = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const q = req.query as unknown as Query;
  const today = localToday();
  const dateFilter = q.dateFrom || q.dateTo ? { ...(q.dateFrom ? { gte: q.dateFrom } : {}), ...(q.dateTo ? { lte: q.dateTo } : {}) } : undefined;
  const memberInclude = { member: { include: { user: { select: { name: true } } } } };

  const incomeWhere: Prisma.IncomeWhereInput = { familyId: c.familyId };
  const expenseWhere: Prisma.ExpenseWhereInput = { familyId: c.familyId };
  if (dateFilter) {
    incomeWhere.date = dateFilter;
    expenseWhere.date = dateFilter;
  }
  if (q.memberId) {
    incomeWhere.memberId = q.memberId;
    expenseWhere.memberId = q.memberId;
  }
  if (q.search) {
    incomeWhere.OR = [
      { source: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
    expenseWhere.OR = [
      { description: { contains: q.search, mode: 'insensitive' } },
      { notes: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const incomeCategoryOk = !q.category || (INCOME_CATEGORIES as readonly string[]).includes(q.category);
  const expenseCategoryOk = !q.category || (EXPENSE_CATEGORIES as readonly string[]).includes(q.category);
  const wantIncome = q.type !== 'EXPENSE' && !q.paymentMethod && incomeCategoryOk;
  const wantExpense = q.type !== 'INCOME' && expenseCategoryOk;
  // Prisma rejects enum values that do not belong to the model, so only apply valid ones per side.
  if (q.category && incomeCategoryOk) (incomeWhere as { category?: unknown }).category = q.category;
  if (q.category && expenseCategoryOk) (expenseWhere as { category?: unknown }).category = q.category;
  if (q.paymentMethod) (expenseWhere as { paymentMethod?: unknown }).paymentMethod = q.paymentMethod;

  const incomes = wantIncome ? await prisma.income.findMany({ where: incomeWhere, include: memberInclude }) : [];
  const expenses = wantExpense ? await prisma.expense.findMany({ where: expenseWhere, include: memberInclude }) : [];

  const unified = [
    ...incomes.map((r) => ({
      id: r.id,
      type: 'INCOME' as const,
      date: r.date,
      category: r.category as string,
      description: r.description ? `${r.source} - ${r.description}` : r.source,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
      paymentMethod: null as string | null,
      isRecurring: r.isRecurring,
      status: r.date.getTime() > today.getTime() ? 'SCHEDULED' : 'RECEIVED',
    })),
    ...expenses.map((r) => ({
      id: r.id,
      type: 'EXPENSE' as const,
      date: r.date,
      category: r.category as string,
      description: r.description,
      amount: num(r.amount),
      memberName: r.member?.user?.name ?? null,
      paymentMethod: r.paymentMethod as string | null,
      isRecurring: r.isRecurring,
      status: r.date.getTime() > today.getTime() ? 'SCHEDULED' : 'PAID',
    })),
  ];

  const dir = q.sortOrder === 'asc' ? 1 : -1;
  unified.sort((a, b) => {
    let cmp = 0;
    if (q.sortBy === 'amount') cmp = a.amount - b.amount;
    else if (q.sortBy === 'category') cmp = a.category.localeCompare(b.category);
    else if (q.sortBy === 'type') cmp = a.type.localeCompare(b.type);
    else cmp = a.date.getTime() - b.date.getTime();
    return cmp === 0 ? b.date.getTime() - a.date.getTime() : cmp * dir;
  });

  const total = unified.length;
  const page = unified.slice((q.page - 1) * q.limit, q.page * q.limit);
  res.json({
    data: page,
    pagination: paginate(total, q.page, q.limit),
    summary: {
      income: round2(unified.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)),
      expenses: round2(unified.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)),
    },
  });
});
