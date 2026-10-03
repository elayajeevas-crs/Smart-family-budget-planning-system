import { prisma } from '../config/prisma';
import { localToday } from '../utils/clock';
import { occurrencesUpTo, type Frequency } from '../utils/finance';
import { num } from '../utils/serialize';

/**
 * Creates expenses for every due occurrence of auto-create recurring items and
 * moves nextDueDate forward. Safe to call repeatedly (idempotent per due date).
 */
export async function processDueRecurring(familyId?: string, now: Date = new Date()): Promise<number> {
  const today = localToday(now);
  const due = await prisma.recurringExpense.findMany({
    where: {
      ...(familyId ? { familyId } : {}),
      isActive: true,
      autoCreateExpense: true,
      nextDueDate: { lte: today },
    },
  });

  let created = 0;
  for (const item of due) {
    const { occurrences, next } = occurrencesUpTo(item.nextDueDate, item.frequency as Frequency, today);
    if (occurrences.length === 0) continue;
    await prisma.$transaction([
      prisma.expense.createMany({
        data: occurrences.map((date) => ({
          familyId: item.familyId,
          createdById: item.createdById,
          amount: num(item.amount),
          category: item.category,
          description: item.name,
          date,
          paymentMethod: item.paymentMethod,
          isRecurring: true,
          notes: 'Auto-created from recurring expense',
          recurringExpenseId: item.id,
        })),
      }),
      prisma.recurringExpense.update({ where: { id: item.id }, data: { nextDueDate: next } }),
    ]);
    created += occurrences.length;
  }
  return created;
}
