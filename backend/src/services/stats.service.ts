import { prisma } from '../config/prisma';
import {
  type BudgetLine,
  type MonthSlot,
  budgetLine,
  monthKey,
  monthRange,
  round2,
} from '../utils/finance';
import { num } from '../utils/serialize';

export interface IncomeRow {
  id: string;
  amount: number;
  category: string;
  date: Date;
  memberId: string | null;
  source: string;
  description: string | null;
}

export interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  date: Date;
  memberId: string | null;
  description: string;
  paymentMethod: string;
}

/** Loads lightweight income + expense rows for a [start, end) window. */
export async function fetchRange(familyId: string, start: Date, end: Date) {
  const where = { familyId, date: { gte: start, lt: end } };
  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({
      where,
      select: { id: true, amount: true, category: true, date: true, memberId: true, source: true, description: true },
    }),
    prisma.expense.findMany({
      where,
      select: {
        id: true,
        amount: true,
        category: true,
        date: true,
        memberId: true,
        description: true,
        paymentMethod: true,
      },
    }),
  ]);
  return {
    incomes: incomes.map((r) => ({ ...r, amount: num(r.amount) })) as IncomeRow[],
    expenses: expenses.map((r) => ({ ...r, amount: num(r.amount) })) as ExpenseRow[],
  };
}

export const sum = (rows: Array<{ amount: number }>): number => round2(rows.reduce((s, r) => s + r.amount, 0));

export function sumByKey<T extends { amount: number }>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = round2((out[key(r)] ?? 0) + r.amount);
  return out;
}

export function inRange<T extends { date: Date }>(rows: T[], start: Date, end: Date): T[] {
  return rows.filter((r) => r.date.getTime() >= start.getTime() && r.date.getTime() < end.getTime());
}

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
}

/** Income / expense / savings per calendar month slot. */
export function monthlySeries(incomes: IncomeRow[], expenses: ExpenseRow[], slots: MonthSlot[]): SeriesPoint[] {
  const inc: Record<string, number> = {};
  const exp: Record<string, number> = {};
  for (const r of incomes) inc[monthKey(r.date)] = (inc[monthKey(r.date)] ?? 0) + r.amount;
  for (const r of expenses) exp[monthKey(r.date)] = (exp[monthKey(r.date)] ?? 0) + r.amount;
  return slots.map((s) => {
    const income = round2(inc[s.key] ?? 0);
    const spent = round2(exp[s.key] ?? 0);
    return { key: s.key, label: s.label, income, expenses: spent, savings: round2(income - spent) };
  });
}

export type BudgetCategoryLine = BudgetLine & { id: string; category: string };

export interface BudgetView {
  id: string;
  month: number;
  year: number;
  total: BudgetLine;
  categories: BudgetCategoryLine[];
  allocated: number;
  unallocated: number;
}

/** Builds the budget with live spent / remaining / % / status for a given month. */
export async function getBudgetView(
  familyId: string,
  year: number,
  month: number,
  spendByCategory?: Record<string, number>,
): Promise<BudgetView | null> {
  const budget = await prisma.budget.findUnique({
    where: { familyId_year_month: { familyId, year, month } },
    include: { categories: true },
  });
  if (!budget) return null;

  let spend = spendByCategory;
  if (!spend) {
    const { start, end } = monthRange(year, month);
    const { expenses } = await fetchRange(familyId, start, end);
    spend = sumByKey(expenses, (e) => e.category);
  }
  const totalSpent = Object.values(spend).reduce((s, v) => s + v, 0);
  const categories = budget.categories
    .map((c) => ({ id: c.id, category: c.category as string, ...budgetLine(num(c.amount), spend?.[c.category] ?? 0) }))
    .sort((a, b) => b.percentUsed - a.percentUsed);
  const allocated = round2(categories.reduce((s, c) => s + c.amount, 0));
  const total = budgetLine(num(budget.totalAmount), totalSpent);
  return {
    id: budget.id,
    month: budget.month,
    year: budget.year,
    total,
    categories,
    allocated,
    unallocated: round2(total.amount - allocated),
  };
}
