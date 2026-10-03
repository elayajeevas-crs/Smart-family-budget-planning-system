import { z } from 'zod';
import {
  PAYMENT_STATUSES,
  dateField,
  expenseCategory,
  money,
  optionalText,
  paginationQuery,
  paymentMethod,
  requiredText,
  sortOrder,
} from './common';

export const paymentSchema = z.object({
  name: requiredText('Payment name'),
  amount: money,
  dueDate: dateField,
  category: expenseCategory,
  status: z.enum(PAYMENT_STATUSES).optional(),
  notes: optionalText(500),
});

export const paymentListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  dueState: z.enum(['UPCOMING', 'DUE_TODAY', 'OVERDUE']).optional(),
  category: expenseCategory.optional(),
  sortBy: z.enum(['dueDate', 'amount', 'name']).default('dueDate'),
  sortOrder: sortOrder.default('asc'),
});

export const markPaidSchema = z.object({
  recordExpense: z.boolean().default(false),
  paymentMethod: paymentMethod.default('UPI'),
});
