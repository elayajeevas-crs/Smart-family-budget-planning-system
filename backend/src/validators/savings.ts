import { z } from 'zod';
import { SAVINGS_CATEGORIES, dateField, money, optionalText, requiredText } from './common';

export const savingsGoalSchema = z.object({
  name: requiredText('Goal name'),
  category: z.enum(SAVINGS_CATEGORIES).default('OTHER'),
  targetAmount: money,
  currentAmount: z.coerce.number().min(0, 'Cannot be negative').max(999_999_999).default(0),
  targetDate: dateField,
  description: optionalText(300),
});

export const contributionSchema = z.object({
  amount: money,
  date: dateField.optional(),
  note: optionalText(200),
});
