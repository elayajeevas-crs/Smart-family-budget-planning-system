import { prisma } from '../config/prisma';
import { currentYearMonth, formatDate, localToday } from '../utils/clock';
import {
  type PaymentStatusValue,
  goalProgress,
  monthRange,
  paymentState,
  addDays,
  percentage,
  round2,
} from '../utils/finance';
import { categoryLabel, formatMoney } from '../utils/insights';
import { num } from '../utils/serialize';
import { fetchRange, getBudgetView, sum, sumByKey } from './stats.service';

interface Draft {
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  dedupeKey: string;
}

const lastSync = new Map<string, number>();

/**
 * Evaluates the family's current financial state and creates any alerts that do not
 * already exist (de-duplicated per user via dedupeKey). Recipients: every family member.
 */
export async function syncNotifications(familyId: string, now: Date = new Date(), force = false): Promise<void> {
  const nowMs = now.getTime();
  const prev = lastSync.get(familyId) ?? 0;
  if (!force && nowMs - prev < 30_000) return;
  lastSync.set(familyId, nowMs);

  const today = localToday(now);
  const { year, month } = currentYearMonth(now);
  const { start, end } = monthRange(year, month);
  const tag = `${year}-${String(month).padStart(2, '0')}`;
  const history = addDays(today, -90);

  const [members, range, payments, goals, recurring] = await Promise.all([
    prisma.familyMember.findMany({ where: { familyId }, select: { userId: true } }),
    fetchRange(familyId, history < start ? history : start, end),
    prisma.payment.findMany({ where: { familyId, status: { in: ['PENDING', 'OVERDUE'] } } }),
    prisma.savingsGoal.findMany({ where: { familyId } }),
    prisma.recurringExpense.findMany({ where: { familyId, isActive: true } }),
  ]);

  const monthIncomes = range.incomes.filter((r) => r.date >= start && r.date < end);
  const monthExpenses = range.expenses.filter((r) => r.date >= start && r.date < end);
  const incomeTotal = sum(monthIncomes);
  const expenseTotal = sum(monthExpenses);
  const spendByCat = sumByKey(monthExpenses, (e) => e.category);
  const drafts: Draft[] = [];

  // --- Budget alerts ---
  const budget = await getBudgetView(familyId, year, month, spendByCat);
  if (budget) {
    const lines = [{ key: 'OVERALL', label: 'monthly', ...budget.total }, ...budget.categories.map((c) => ({ key: c.category, label: categoryLabel(c.category), ...c }))];
    for (const l of lines) {
      if (l.status === 'EXCEEDED') {
        drafts.push({
          title: 'Budget exceeded',
          message: `Your ${l.label} budget is exceeded: ${formatMoney(l.spent)} spent against ${formatMoney(l.amount)}.`,
          severity: 'CRITICAL',
          dedupeKey: `budget-exceeded:${l.key}:${tag}`,
        });
      } else if (l.status === 'CRITICAL') {
        drafts.push({
          title: 'Budget nearing limit',
          message: `You have used ${Math.round(l.percentUsed)}% of your ${l.label} budget. Only ${formatMoney(l.remaining)} is left this month.`,
          severity: 'WARNING',
          dedupeKey: `budget-near:${l.key}:${tag}`,
        });
      }
    }
  }

  // --- Payments ---
  for (const p of payments) {
    const st = paymentState(p.status as PaymentStatusValue, p.dueDate, today);
    if (st.dueState === 'OVERDUE') {
      drafts.push({
        title: 'Payment overdue',
        message: `${p.name} (${formatMoney(num(p.amount))}) was due on ${formatDate(p.dueDate)}. Pay it soon to avoid late fees.`,
        severity: 'CRITICAL',
        dedupeKey: `payment-overdue:${p.id}`,
      });
    } else if (st.daysUntilDue <= 3) {
      drafts.push({
        title: 'Payment due soon',
        message:
          st.daysUntilDue === 0
            ? `${p.name} (${formatMoney(num(p.amount))}) is due today.`
            : `${p.name} (${formatMoney(num(p.amount))}) is due on ${formatDate(p.dueDate)}.`,
        severity: st.daysUntilDue <= 1 ? 'WARNING' : 'INFO',
        dedupeKey: `payment-due:${p.id}`,
      });
    }
  }

  // --- Savings goals ---
  for (const g of goals) {
    const prog = goalProgress(
      { targetAmount: num(g.targetAmount), currentAmount: num(g.currentAmount), targetDate: g.targetDate, createdAt: g.createdAt },
      today,
    );
    if (prog.status === 'BEHIND' || prog.status === 'OVERDUE') {
      drafts.push({
        title: 'Savings goal falling behind',
        message: `"${g.name}" is ${Math.round(prog.progressPercent)}% funded but should be near ${Math.round(
          prog.expectedPercent,
        )}%. Saving about ${formatMoney(prog.requiredMonthlySaving)} a month would get you there.`,
        severity: 'WARNING',
        dedupeKey: `goal-behind:${g.id}:${tag}`,
      });
    }
  }

  // --- Recurring reminders ---
  for (const r of recurring) {
    const days = Math.round((r.nextDueDate.getTime() - today.getTime()) / 86_400_000);
    if (days >= 0 && days <= r.reminderDays) {
      drafts.push({
        title: 'Recurring expense coming up',
        message: `${r.name} (${formatMoney(num(r.amount))}) is due ${days === 0 ? 'today' : `on ${formatDate(r.nextDueDate)}`}.`,
        severity: 'INFO',
        dedupeKey: `recurring-due:${r.id}:${r.nextDueDate.toISOString().slice(0, 10)}`,
      });
    }
  }

  // --- Unusual spending (single expense far above the category's recent average) ---
  const prior = range.expenses.filter((r) => r.date < start);
  for (const e of monthExpenses) {
    const peers = prior.filter((p) => p.category === e.category);
    if (peers.length < 3 || e.amount < 1000) continue;
    const avg = sum(peers) / peers.length;
    if (avg > 0 && e.amount >= avg * 2.5) {
      drafts.push({
        title: 'Unusual spending detected',
        message: `${e.description} (${formatMoney(e.amount)}) is about ${(e.amount / avg).toFixed(1)}x your usual ${categoryLabel(
          e.category,
        )} expense.`,
        severity: 'WARNING',
        dedupeKey: `unusual:${e.id}`,
      });
    }
  }

  // --- Low remaining balance ---
  const balance = round2(incomeTotal - expenseTotal);
  if (expenseTotal > 0 && balance < 0) {
    drafts.push({
      title: 'Spending exceeds income',
      message: `You have spent ${formatMoney(-balance)} more than you earned this month.`,
      severity: 'CRITICAL',
      dedupeKey: `balance-negative:${tag}`,
    });
  } else if (incomeTotal > 0 && percentage(balance, incomeTotal) < 10 && expenseTotal > 0) {
    drafts.push({
      title: 'Low remaining balance',
      message: `Only ${formatMoney(balance)} (${percentage(balance, incomeTotal)}% of income) is left this month.`,
      severity: 'WARNING',
      dedupeKey: `balance-low:${tag}`,
    });
  }

  if (drafts.length === 0 || members.length === 0) return;

  await prisma.notification.createMany({
    data: members.flatMap((m) => drafts.map((d) => ({ userId: m.userId, familyId, ...d }))),
    skipDuplicates: true,
  });
}

