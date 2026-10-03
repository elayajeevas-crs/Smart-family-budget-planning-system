import { type BudgetStatus, pctChange, percentage, round1, round2, safeDivide } from './finance';

export type InsightSeverity = 'SUCCESS' | 'INFO' | 'WARNING' | 'CRITICAL';

export interface Insight {
  id: string;
  type: string;
  severity: InsightSeverity;
  message: string;
}

export interface InsightBudgetLine {
  category: string; // enum name or 'OVERALL'
  amount: number;
  spent: number;
  percentUsed: number;
  status: BudgetStatus;
}

export interface InsightInput {
  income: number;
  expenses: number;
  categorySpend: Record<string, number>;
  prevCategorySpend: Record<string, number>;
  prevExpenses: number;
  budgetLines: InsightBudgetLine[];
  recurringMonthly: number;
}

const SPECIAL_LABELS: Record<string, string> = { EMI_LOAN: 'EMI / Loan', OVERALL: 'Overall' };

export function categoryLabel(key: string): string {
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatMoney(n: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

const DISCRETIONARY = ['ENTERTAINMENT', 'SHOPPING'];

/** Builds human-readable insights purely from the numbers passed in. */
export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { income, expenses, categorySpend, prevCategorySpend, prevExpenses, budgetLines, recurringMonthly } = input;

  if (income <= 0 && expenses <= 0) {
    return [
      {
        id: 'no-data',
        type: 'getting-started',
        severity: 'INFO',
        message: 'Add income and expenses for this month to unlock personalised insights.',
      },
    ];
  }

  // 1. Highest spending category
  const ranked = Object.entries(categorySpend)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0 && expenses > 0) {
    const [cat, amt] = ranked[0];
    out.push({
      id: 'top-category',
      type: 'top-category',
      severity: 'INFO',
      message: `${categoryLabel(cat)} is your highest expense category this month (${formatMoney(amt)}, ${round1(
        percentage(amt, expenses),
      )}% of spending).`,
    });
  }

  // 2. Budget status (worst first, max 3)
  const risky = [...budgetLines]
    .filter((b) => b.status !== 'SAFE')
    .sort((a, b) => b.percentUsed - a.percentUsed)
    .slice(0, 3);
  for (const b of risky) {
    const label = b.category === 'OVERALL' ? 'monthly' : categoryLabel(b.category);
    if (b.status === 'EXCEEDED') {
      out.push({
        id: `budget-exceeded-${b.category}`,
        type: 'budget-exceeded',
        severity: 'CRITICAL',
        message: `You have exceeded your ${label} budget by ${formatMoney(b.spent - b.amount)} (${Math.round(b.percentUsed)}% used).`,
      });
    } else {
      out.push({
        id: `budget-near-${b.category}`,
        type: 'budget-near-limit',
        severity: b.status === 'CRITICAL' ? 'WARNING' : 'INFO',
        message: `You have used ${Math.round(b.percentUsed)}% of your ${label} budget.`,
      });
    }
  }

  // 3. Month-over-month changes
  const overall = pctChange(expenses, prevExpenses);
  if (overall !== null && overall >= 5) {
    out.push({
      id: 'mom-up',
      type: 'spending-change',
      severity: 'WARNING',
      message: `Your total spending is up ${overall}% compared with last month.`,
    });
  } else if (overall !== null && overall <= -5) {
    out.push({
      id: 'mom-down',
      type: 'spending-change',
      severity: 'SUCCESS',
      message: `Your total spending is down ${Math.abs(overall)}% compared with last month. Nice work.`,
    });
  }

  const increases = Object.keys(categorySpend)
    .map((cat) => ({ cat, cur: categorySpend[cat], change: pctChange(categorySpend[cat], prevCategorySpend[cat] ?? 0) }))
    .filter((x) => x.change !== null && x.change >= 10 && x.cur >= 500)
    .sort((a, b) => (b.change as number) - (a.change as number))
    .slice(0, 2);
  for (const inc of increases) {
    out.push({
      id: `category-up-${inc.cat}`,
      type: 'category-increase',
      severity: 'WARNING',
      message: `${categoryLabel(inc.cat)} spending increased by ${inc.change}% compared with last month.`,
    });
  }

  // 4. Savings rate & expense-to-income ratio
  if (income > 0) {
    const rate = percentage(income - expenses, income);
    if (rate < 0) {
      out.push({
        id: 'savings-negative',
        type: 'savings-rate',
        severity: 'CRITICAL',
        message: `You have spent ${formatMoney(expenses - income)} more than you earned this month. Review your largest categories to avoid borrowing.`,
      });
    } else if (rate >= 20) {
      out.push({
        id: 'savings-good',
        type: 'savings-rate',
        severity: 'SUCCESS',
        message: `Your current savings rate is ${round1(rate)}%. You are on a healthy path.`,
      });
    } else {
      out.push({
        id: 'savings-low',
        type: 'savings-rate',
        severity: 'INFO',
        message: `Your current savings rate is ${round1(rate)}%. Aiming for 20% or more builds a stronger safety net.`,
      });
    }
    const ratio = percentage(expenses, income);
    if (ratio >= 80 && rate >= 0) {
      out.push({
        id: 'expense-ratio',
        type: 'expense-ratio',
        severity: 'WARNING',
        message: `Expenses are ${round1(ratio)}% of your income, leaving little room for savings or surprises.`,
      });
    }
  }

  // 5. Recurring burden
  if (income > 0 && recurringMonthly > 0) {
    const pct = round1(percentage(recurringMonthly, income));
    out.push({
      id: 'recurring-burden',
      type: 'recurring-burden',
      severity: pct >= 40 ? 'WARNING' : 'INFO',
      message: `Recurring expenses (about ${formatMoney(recurringMonthly)} a month) take ${pct}% of your monthly income.`,
    });
  }

  // 6. Debt awareness
  const emi = categorySpend.EMI_LOAN ?? 0;
  if (income > 0 && emi > 0 && percentage(emi, income) >= 30) {
    out.push({
      id: 'emi-burden',
      type: 'debt',
      severity: 'WARNING',
      message: `EMI / loan payments use ${round1(percentage(emi, income))}% of your income. Focus on clearing existing loans before taking on new ones.`,
    });
  }

  // 7. Savings opportunity
  const discretionary = DISCRETIONARY.reduce((s, c) => s + (categorySpend[c] ?? 0), 0);
  if (expenses > 0 && safeDivide(discretionary, expenses) >= 0.25) {
    out.push({
      id: 'savings-opportunity',
      type: 'opportunity',
      severity: 'INFO',
      message: `Entertainment and shopping make up ${round1(percentage(discretionary, expenses))}% of your spending. Trimming them by 15% could free up about ${formatMoney(
        round2(discretionary * 0.15),
      )} a month.`,
    });
  }

  return out;
}
