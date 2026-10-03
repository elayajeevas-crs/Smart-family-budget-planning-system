import { z } from 'zod';
import {
  boolString,
  dateField,
  expenseCategory,
  money,
  optionalText,
  paginationQuery,
  paymentMethod,
  requiredText,
  sortOrder,
} from './common';

export const expenseSchema = z.object({
  amount: money,
  category: expenseCategory,
  description: requiredText('Description', 200),
  date: dateField,
  paymentMethod: paymentMethod.default('UPI'),
  isRecurring: z.boolean().default(false),
  notes: optionalText(500),
  memberId: z.string().min(1).nullish(),
});

export const expenseListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  category: expenseCategory.optional(),
  paymentMethod: paymentMethod.optional(),
  memberId: z.string().optional(),
  isRecurring: boolString,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'createdAt']).default('date'),
  sortOrder,
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuery>;
