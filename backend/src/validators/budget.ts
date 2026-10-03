import { z } from 'zod';
import { expenseCategory, money } from './common';

export const budgetSchema = z
  .object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    totalAmount: money,
    categories: z
      .array(z.object({ category: expenseCategory, amount: money }))
      .max(20)
      .default([]),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    for (const [i, c] of d.categories.entries()) {
      if (seen.has(c.category)) {
        ctx.addIssue({ code: 'custom', path: ['categories', i, 'category'], message: 'Duplicate category' });
      }
      seen.add(c.category);
    }
    const sum = d.categories.reduce((s, c) => s + c.amount, 0);
    if (sum > d.totalAmount + 0.001) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalAmount'],
        message: 'Category budgets add up to more than the monthly total',
      });
    }
  });

export type BudgetInput = z.infer<typeof budgetSchema>;
