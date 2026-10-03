import { z } from 'zod';
import { round2 } from '../utils/finance';

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

export const incomeCategory = z.enum(INCOME_CATEGORIES);
export const expenseCategory = z.enum(EXPENSE_CATEGORIES);
export const frequency = z.enum(FREQUENCIES);
export const paymentMethod = z.enum(PAYMENT_METHODS);

export const money = z.coerce
  .number({ invalid_type_error: 'Amount must be a number' })
  .positive('Amount must be greater than 0')
  .max(999_999_999, 'Amount is too large')
  .transform(round2);

export const dateField = z.coerce.date({ invalid_type_error: 'Enter a valid date' });

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 120) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

export const idParam = z.object({ id: z.string().min(1) });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const sortOrder = z.enum(['asc', 'desc']).default('desc');

export const boolString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const monthYearQuery = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const rangeQuery = z.object({
  range: z.enum(['this_month', 'last_month', 'last_3_months', 'last_6_months', 'this_year', 'custom']).default('this_month'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function paginate(total: number, page: number, limit: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
