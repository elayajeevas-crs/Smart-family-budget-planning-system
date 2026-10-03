import { z } from 'zod';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, paginationQuery, paymentMethod, sortOrder } from './common';

const allCategories = Array.from(new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])) as [string, ...string[]];

export const transactionQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  category: z.enum(allCategories).optional(),
  paymentMethod: paymentMethod.optional(),
  memberId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'type']).default('date'),
  sortOrder,
});
