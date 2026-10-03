import { z } from 'zod';
import {
  boolString,
  dateField,
  frequency,
  incomeCategory,
  money,
  optionalText,
  paginationQuery,
  requiredText,
  sortOrder,
} from './common';

export const incomeSchema = z
  .object({
    amount: money,
    source: requiredText('Source'),
    category: incomeCategory,
    date: dateField,
    description: optionalText(500),
    isRecurring: z.boolean().default(false),
    frequency: frequency.nullish(),
    memberId: z.string().min(1).nullish(),
  })
  .superRefine((d, ctx) => {
    if (d.isRecurring && !d.frequency) {
      ctx.addIssue({ code: 'custom', path: ['frequency'], message: 'Choose a frequency for recurring income' });
    }
  });

export const incomeListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  category: incomeCategory.optional(),
  memberId: z.string().optional(),
  isRecurring: boolString,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'createdAt']).default('date'),
  sortOrder,
});

export type IncomeInput = z.infer<typeof incomeSchema>;
export type IncomeListQuery = z.infer<typeof incomeListQuery>;
