import type { ExpenseCategory, Frequency, IncomeCategory, PaymentMethod, Role, SavingsCategory } from '@shared/constants';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  familyId: string | null;
  memberId: string | null;
  family: { id: string; name: string } | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  pagination: Pagination;
}

export type BudgetStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';

export interface BudgetLine {
  amount: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetStatus;
}
export interface BudgetCategoryLine extends BudgetLine {
  id: string;
  category: ExpenseCategory;
}
export interface BudgetView {
  id: string;
  month: number;
  year: number;
  total: BudgetLine;
  categories: BudgetCategoryLine[];
  allocated: number;
  unallocated: number;
}

export interface FamilyInfo {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
}
export interface FamilyFinancials {
  month: number;
  year: number;
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
  goalsSaved: number;
  goalsTarget: number;
}
export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  monthIncome: number;
  monthExpenses: number;
  isYou: boolean;
}

export interface IncomeRecord {
  id: string;
  amount: number;
  source: string;
  category: IncomeCategory;
  date: string;
  description: string | null;
  isRecurring: boolean;
  frequency: Frequency | null;
  memberId: string | null;
  memberName: string | null;
  createdById: string;
  createdByName: string | null;
  canEdit: boolean;
}

export interface ExpenseRecord {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  notes: string | null;
  memberId: string | null;
  memberName: string | null;
  createdById: string;
  createdByName: string | null;
  canEdit: boolean;
}

export interface SavingsGoal {
  id: string;
  name: string;
  category: SavingsCategory;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  description: string | null;
  createdAt: string;
  progressPercent: number;
  remainingAmount: number;
  monthsLeft: number;
  requiredMonthlySaving: number;
  expectedPercent: number;
  status: 'COMPLETED' | 'ON_TRACK' | 'BEHIND' | 'OVERDUE';
}
export interface Contribution {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  userName: string | null;
}

export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  nextDueDate: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  autoCreateExpense: boolean;
  reminderDays: number;
  isActive: boolean;
  monthlyEquivalent: number;
  daysUntilDue: number;
}

export type DueState = 'PAID' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';
export interface PaymentItem {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  category: ExpenseCategory;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  notes: string | null;
  paidAt: string | null;
  dueState: DueState;
  daysUntilDue: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  createdAt: string;
}

export interface Insight {
  id: string;
  type: string;
  severity: 'SUCCESS' | 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface CategoryShare {
  category: string;
  amount: number;
  percent: number;
}

export interface TransactionItem {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  date: string;
  category: string;
  description: string;
  amount: number;
  memberName: string | null;
  paymentMethod: string | null;
  isRecurring: boolean;
  status: 'RECEIVED' | 'PAID' | 'SCHEDULED';
}

export interface DashboardData {
  period: { month: number; year: number };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    remainingBalance: number;
    totalSavings: number;
    savingsRate: number;
    expenseToIncomeRatio: number;
    monthlyBudget: number;
    budgetUsed: number;
    budgetRemaining: number;
    budgetUsedPercent: number;
    budgetStatus: BudgetStatus | null;
    hasBudget: boolean;
    pendingPayments: { count: number; amount: number; overdueCount: number };
    goalsSaved: number;
    goalsTarget: number;
  };
  charts: {
    incomeVsExpenses: SeriesPoint[];
    expenseByCategory: CategoryShare[];
    spendingTrend: { label: string; expenses: number }[];
    savingsTrend: { label: string; savings: number }[];
    budgetVsActual: { category: string; budget: number; actual: number }[];
  };
  budget: BudgetView | null;
  recentTransactions: Omit<TransactionItem, 'paymentMethod' | 'isRecurring' | 'status'>[];
  upcomingPayments: {
    id: string;
    name: string;
    amount: number;
    dueDate: string;
    category: string;
    dueState: DueState;
    daysUntilDue: number;
  }[];
  alerts: NotificationItem[];
  insights: Insight[];
}

export type RangeKey = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom';
