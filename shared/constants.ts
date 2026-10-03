/**
 * Constants shared by the UI. They mirror the Prisma enums in backend/prisma/schema.prisma.
 * (The frontend imports this file through the "@shared" alias.)
 */
export const INCOME_CATEGORIES = ['SALARY', 'BUSINESS', 'FREELANCE', 'INVESTMENT', 'RENTAL', 'BONUS', 'OTHER'] as const;

export const EXPENSE_CATEGORIES = [
  'FOOD',
  'GROCERIES',
  'HOUSING',
  'ELECTRICITY',
  'WATER',
  'INTERNET',
  'TRANSPORTATION',
  'EDUCATION',
  'HEALTHCARE',
  'SHOPPING',
  'ENTERTAINMENT',
  'EMI_LOAN',
  'INSURANCE',
  'BILLS',
  'OTHER',
] as const;

export const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export const SAVINGS_CATEGORIES = ['EMERGENCY_FUND', 'LAPTOP', 'EDUCATION', 'VACATION', 'VEHICLE', 'HOUSE', 'OTHER'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
export const ROLES = ['ADMIN', 'MEMBER'] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type SavingsCategory = (typeof SAVINGS_CATEGORIES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type Role = (typeof ROLES)[number];

export const LABELS: Record<string, string> = {
  // income
  SALARY: 'Salary',
  BUSINESS: 'Business',
  FREELANCE: 'Freelance',
  INVESTMENT: 'Investment',
  RENTAL: 'Rental',
  BONUS: 'Bonus',
  OTHER: 'Other',
  // expense
  FOOD: 'Food',
  GROCERIES: 'Groceries',
  HOUSING: 'Housing',
  ELECTRICITY: 'Electricity',
  WATER: 'Water',
  INTERNET: 'Internet',
  TRANSPORTATION: 'Transportation',
  EDUCATION: 'Education',
  HEALTHCARE: 'Healthcare',
  SHOPPING: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  EMI_LOAN: 'EMI / Loan',
  INSURANCE: 'Insurance',
  BILLS: 'Bills',
  // frequency
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  // payment method
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  // savings
  EMERGENCY_FUND: 'Emergency fund',
  LAPTOP: 'New laptop',
  VACATION: 'Vacation',
  VEHICLE: 'Vehicle',
  HOUSE: 'House',
  // status
  PENDING: 'Pending',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  // budget status
  SAFE: 'Safe',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
  EXCEEDED: 'Exceeded',
  // goal status
  COMPLETED: 'Completed',
  ON_TRACK: 'On track',
  BEHIND: 'Behind',
  // transaction status
  RECEIVED: 'Received',
  SCHEDULED: 'Scheduled',
  // due state
  DUE_TODAY: 'Due today',
  UPCOMING: 'Upcoming',
};

export const label = (key: string | null | undefined): string => (key ? LABELS[key] ?? key : '-');

export const CATEGORY_COLORS: Record<string, string> = {
  FOOD: '#f97316',
  GROCERIES: '#22c55e',
  HOUSING: '#6366f1',
  ELECTRICITY: '#eab308',
  WATER: '#06b6d4',
  INTERNET: '#8b5cf6',
  TRANSPORTATION: '#14b8a6',
  EDUCATION: '#3b82f6',
  HEALTHCARE: '#ef4444',
  SHOPPING: '#ec4899',
  ENTERTAINMENT: '#a855f7',
  EMI_LOAN: '#dc2626',
  INSURANCE: '#0ea5e9',
  BILLS: '#f59e0b',
  OTHER: '#64748b',
  SALARY: '#10b981',
  BUSINESS: '#3b82f6',
  FREELANCE: '#8b5cf6',
  INVESTMENT: '#06b6d4',
  RENTAL: '#f59e0b',
  BONUS: '#ec4899',
};

export const categoryColor = (key: string): string => CATEGORY_COLORS[key] ?? '#64748b';
