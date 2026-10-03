import { z } from 'zod';
import { dateField, expenseCategory, frequency, money, paymentMethod, requiredText } from './common';

export const recurringSchema = z.object({
  name: requiredText('Name'),
  amount: money,
  frequency: frequency,
  nextDueDate: dateField,
  category: expenseCategory,
  paymentMethod: paymentMethod.default('UPI'),
  autoCreateExpense: z.boolean().default(false),
  reminderDays: z.coerce.number().int().min(0).max(30).default(3),
  isActive: z.boolean().default(true),
});
