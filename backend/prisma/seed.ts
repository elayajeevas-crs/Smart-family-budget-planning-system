/**
 * Demo data seed.
 *
 * Creates a clearly-labelled DEMO family so the dashboard is populated immediately:
 *   Email:    demo@smartbudget.com
 *   Password: Demo@12345
 *
 * Re-running the seed wipes and recreates only the demo family/users.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';
const FAMILY_NAME = 'Sharma Family (Demo)';
const DEMO_EMAILS = ['demo@smartbudget.com', 'priya.demo@smartbudget.com', 'arjun.demo@smartbudget.com'];
const TZ_OFFSET = Number(process.env.TZ_OFFSET_MINUTES ?? 330);

type ExpenseCat = Prisma.ExpenseCreateManyInput['category'];
type Method = NonNullable<Prisma.ExpenseCreateManyInput['paymentMethod']>;

// ---------- helpers ----------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261002);
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const now = new Date(Date.now() + TZ_OFFSET * 60_000);
const today = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** First day of the month `offset` months from the current one. */
function monthStart(offset: number): Date {
  const total = today.getUTCFullYear() * 12 + today.getUTCMonth() + offset;
  return utc(Math.floor(total / 12), total % 12, 1);
}
/** Date inside a month; the current month is compressed so every day <= today. */
function dayIn(offset: number, day: number): Date {
  const ms = monthStart(offset);
  const y = ms.getUTCFullYear();
  const m = ms.getUTCMonth();
  let d = Math.min(day, daysInMonth(y, m));
  if (offset === 0) d = Math.min(d, today.getUTCDate());
  return utc(y, m, d);
}

async function main() {
  console.log('Seeding demo data...');

  // ---- clean previous demo data ----
  await prisma.family.deleteMany({ where: { name: FAMILY_NAME } });
  await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });

  // ---- users + family ----
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const rajeshUser = await prisma.user.create({
    data: { name: 'Rajesh Sharma', email: DEMO_EMAILS[0], passwordHash, role: 'ADMIN' },
  });
  const priyaUser = await prisma.user.create({
    data: { name: 'Priya Sharma', email: DEMO_EMAILS[1], passwordHash, role: 'MEMBER' },
  });
  const arjunUser = await prisma.user.create({
    data: { name: 'Arjun Sharma', email: DEMO_EMAILS[2], passwordHash, role: 'MEMBER' },
  });

  const family = await prisma.family.create({
    data: {
      name: FAMILY_NAME,
      description: 'Demo family with sample data. Safe to explore, edit or delete.',
      members: {
        create: [
          { userId: rajeshUser.id, role: 'ADMIN' },
          { userId: priyaUser.id, role: 'MEMBER' },
          { userId: arjunUser.id, role: 'MEMBER' },
        ],
      },
    },
    include: { members: true },
  });
  const memberOf = (userId: string) => family.members.find((m) => m.userId === userId)!.id;
  const rajesh = { userId: rajeshUser.id, memberId: memberOf(rajeshUser.id) };
  const priya = { userId: priyaUser.id, memberId: memberOf(priyaUser.id) };
  const arjun = { userId: arjunUser.id, memberId: memberOf(arjunUser.id) };
  const familyId = family.id;

  // ---- income: 12 months ----
  const incomes: Prisma.IncomeCreateManyInput[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const off = -i;
    incomes.push(
      { familyId, createdById: rajesh.userId, memberId: rajesh.memberId, amount: 62000, source: 'Monthly salary - Rajesh', category: 'SALARY', date: dayIn(off, 1), isRecurring: true, frequency: 'MONTHLY', description: 'Net salary credited' },
      { familyId, createdById: priya.userId, memberId: priya.memberId, amount: 38000, source: 'Monthly salary - Priya', category: 'SALARY', date: dayIn(off, 1), isRecurring: true, frequency: 'MONTHLY', description: 'Net salary credited' },
      { familyId, createdById: rajesh.userId, memberId: rajesh.memberId, amount: 10000, source: 'Flat rental income', category: 'RENTAL', date: dayIn(off, 5), isRecurring: true, frequency: 'MONTHLY', description: 'Tenant rent - second flat' },
    );
    if (i % 3 === 0) {
      incomes.push({ familyId, createdById: priya.userId, memberId: priya.memberId, amount: between(8000, 16000), source: 'Freelance design project', category: 'FREELANCE', date: dayIn(off, 18), isRecurring: false, description: 'Weekend client work' });
    }
    if (i % 3 === 1) {
      incomes.push({ familyId, createdById: rajesh.userId, memberId: rajesh.memberId, amount: 4200, source: 'Mutual fund dividend', category: 'INVESTMENT', date: dayIn(off, 20), isRecurring: false, description: 'Quarterly dividend payout' });
    }
    if (i === 5) {
      incomes.push({ familyId, createdById: rajesh.userId, memberId: rajesh.memberId, amount: 40000, source: 'Annual performance bonus', category: 'BONUS', date: dayIn(off, 12), isRecurring: false });
    }
  }
  await prisma.income.createMany({ data: incomes });

  // ---- expenses: 12 months ----
  interface Tpl {
    category: ExpenseCat;
    description: string | string[];
    min: number;
    max: number;
    days: number[];
    by: { userId: string; memberId: string };
    method: Method;
    recurring?: boolean;
    everyMonths?: number;
  }
  const templates: Tpl[] = [
    { category: 'HOUSING', description: 'House rent', min: 22000, max: 22000, days: [1], by: rajesh, method: 'BANK_TRANSFER', recurring: true },
    { category: 'EMI_LOAN', description: 'Car loan EMI', min: 14500, max: 14500, days: [5], by: rajesh, method: 'BANK_TRANSFER', recurring: true },
    { category: 'EDUCATION', description: 'School fees - Arjun tuition', min: 8500, max: 8500, days: [7], by: rajesh, method: 'UPI', recurring: true },
    { category: 'INSURANCE', description: 'LIC premium (quarterly)', min: 6200, max: 6200, days: [10], by: rajesh, method: 'BANK_TRANSFER', recurring: true, everyMonths: 3 },
    { category: 'ELECTRICITY', description: 'Electricity bill', min: 2400, max: 3600, days: [12], by: rajesh, method: 'UPI' },
    { category: 'WATER', description: 'Metro water bill', min: 420, max: 520, days: [12], by: rajesh, method: 'UPI' },
    { category: 'INTERNET', description: 'Fibernet broadband', min: 1099, max: 1099, days: [3], by: priya, method: 'CARD', recurring: true },
    { category: 'BILLS', description: ['Mobile recharge', 'Postpaid mobile bill'], min: 599, max: 799, days: [4, 6], by: priya, method: 'UPI' },
    { category: 'GROCERIES', description: 'Weekly groceries - supermarket', min: 1800, max: 3400, days: [4, 11, 18, 25], by: priya, method: 'UPI' },
    { category: 'FOOD', description: ['Dinner at restaurant', 'Swiggy order', 'Zomato order', 'Tea & snacks', 'Weekend brunch'], min: 250, max: 1100, days: [2, 6, 9, 13, 16, 21, 24, 28], by: priya, method: 'UPI' },
    { category: 'TRANSPORTATION', description: ['Petrol', 'Auto fare', 'Metro card recharge', 'Cab ride'], min: 150, max: 1600, days: [3, 8, 12, 17, 22, 27], by: rajesh, method: 'UPI' },
    { category: 'HEALTHCARE', description: ['Pharmacy', 'Doctor consultation', 'Lab tests'], min: 500, max: 2200, days: [15], by: priya, method: 'CARD', everyMonths: 2 },
    { category: 'SHOPPING', description: ['Clothes', 'Amazon order', 'Home essentials'], min: 700, max: 1500, days: [8, 19, 26], by: priya, method: 'CARD' },
    { category: 'ENTERTAINMENT', description: ['Movie tickets', 'Streaming subscription', 'Weekend outing'], min: 300, max: 1100, days: [9, 15, 23], by: arjun, method: 'UPI' },
  ];

  // Category totals forced for the last two months so budget statuses and insights are varied.
  const targets: Record<number, Partial<Record<ExpenseCat, number>>> = {
    0: { ENTERTAINMENT: 3230, FOOD: 6100, SHOPPING: 5450, GROCERIES: 9300, TRANSPORTATION: 3900, HEALTHCARE: 1650 },
    [-1]: { ENTERTAINMENT: 2600, FOOD: 5000, SHOPPING: 3800, GROCERIES: 9800, TRANSPORTATION: 3600 },
  };

  const expenses: Prisma.ExpenseCreateManyInput[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const off = -i;
    const monthRows: Prisma.ExpenseCreateManyInput[] = [];
    for (const t of templates) {
      if (t.everyMonths && i % t.everyMonths !== 0) continue;
      for (const day of t.days) {
        monthRows.push({
          familyId,
          createdById: t.by.userId,
          memberId: t.by.memberId,
          amount: t.min === t.max ? t.min : between(t.min, t.max),
          category: t.category,
          description: Array.isArray(t.description) ? pick(t.description) : t.description,
          date: dayIn(off, day),
          paymentMethod: t.method,
          isRecurring: Boolean(t.recurring),
        });
      }
    }
    const tg = targets[off];
    if (tg) {
      for (const [cat, total] of Object.entries(tg) as [ExpenseCat, number][]) {
        const rows = monthRows.filter((r) => r.category === cat);
        const current = rows.reduce((s, r) => s + Number(r.amount), 0);
        if (!rows.length || !current) continue;
        let assigned = 0;
        rows.forEach((r, idx) => {
          if (idx === rows.length - 1) r.amount = total - assigned;
          else {
            r.amount = Math.round((Number(r.amount) / current) * total);
            assigned += Number(r.amount);
          }
        });
      }
    }
    expenses.push(...monthRows);
  }
  await prisma.expense.createMany({ data: expenses });

  // ---- budgets: current + previous 5 months ----
  const budgetPlan: Array<[ExpenseCat, number]> = [
    ['HOUSING', 22000], ['EMI_LOAN', 14500], ['EDUCATION', 9000], ['GROCERIES', 12000], ['FOOD', 8000],
    ['TRANSPORTATION', 6000], ['ELECTRICITY', 3500], ['SHOPPING', 5000], ['ENTERTAINMENT', 3500],
    ['HEALTHCARE', 3000], ['INSURANCE', 6500], ['BILLS', 2000], ['WATER', 600], ['INTERNET', 1200],
  ];
  for (let i = 5; i >= 0; i -= 1) {
    const ms = monthStart(-i);
    await prisma.budget.create({
      data: {
        familyId,
        month: ms.getUTCMonth() + 1,
        year: ms.getUTCFullYear(),
        totalAmount: 100000,
        categories: { create: budgetPlan.map(([category, amount]) => ({ category, amount })) },
      },
    });
  }

  // ---- savings goals + contributions ----
  const goals: Array<{
    name: string;
    category: Prisma.SavingsGoalCreateInput['category'];
    target: number;
    targetDate: Date;
    createdMonthsAgo: number;
    description: string;
    contributions: number[]; // newest last, one per month going back from "contributions.length - 1" months ago
  }> = [
    { name: 'Emergency Fund', category: 'EMERGENCY_FUND', target: 300000, targetDate: addDays(today, 14 * 30), createdMonthsAgo: 9, description: '6 months of essential expenses', contributions: [15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 22000] },
    { name: 'New Laptop', category: 'LAPTOP', target: 90000, targetDate: addDays(today, 4 * 30), createdMonthsAgo: 5, description: "Arjun's engineering laptop", contributions: [10000, 10000, 10000, 10000, 14000] },
    { name: 'Goa Vacation', category: 'VACATION', target: 60000, targetDate: addDays(today, 3 * 30), createdMonthsAgo: 7, description: 'Family trip - deliberately behind schedule in the demo', contributions: [2000, 2000, 2000, 2000, 2000, 2000] },
    { name: "Arjun's Education Fund", category: 'EDUCATION', target: 500000, targetDate: addDays(today, 36 * 30), createdMonthsAgo: 10, description: 'Higher studies fund', contributions: [18000, 18000, 18000, 18000, 18000] },
  ];
  for (const g of goals) {
    const total = g.contributions.reduce((s, x) => s + x, 0);
    const created = await prisma.savingsGoal.create({
      data: {
        familyId,
        name: g.name,
        category: g.category,
        targetAmount: g.target,
        currentAmount: total,
        targetDate: g.targetDate,
        description: g.description,
        createdAt: addDays(today, -g.createdMonthsAgo * 30),
      },
    });
    const n = g.contributions.length;
    await prisma.savingsContribution.createMany({
      data: g.contributions.map((amount, idx) => ({
        goalId: created.id,
        userId: idx % 2 === 0 ? rajesh.userId : priya.userId,
        amount,
        date: dayIn(-(n - 1 - idx), 2),
        note: idx === n - 1 ? 'Latest contribution' : 'Monthly contribution',
      })),
    });
  }

  // ---- recurring expenses ----
  const nextMonthDay = (day: number) => {
    const ms = monthStart(1);
    return utc(ms.getUTCFullYear(), ms.getUTCMonth(), Math.min(day, daysInMonth(ms.getUTCFullYear(), ms.getUTCMonth())));
  };
  await prisma.recurringExpense.createMany({
    data: [
      { familyId, createdById: rajesh.userId, name: 'House rent', amount: 22000, frequency: 'MONTHLY', nextDueDate: nextMonthDay(1), category: 'HOUSING', paymentMethod: 'BANK_TRANSFER', autoCreateExpense: true, reminderDays: 3 },
      { familyId, createdById: rajesh.userId, name: 'Car loan EMI', amount: 14500, frequency: 'MONTHLY', nextDueDate: nextMonthDay(5), category: 'EMI_LOAN', paymentMethod: 'BANK_TRANSFER', autoCreateExpense: false, reminderDays: 5 },
      { familyId, createdById: rajesh.userId, name: 'Fibernet broadband', amount: 1099, frequency: 'MONTHLY', nextDueDate: nextMonthDay(3), category: 'INTERNET', paymentMethod: 'CARD', autoCreateExpense: true, reminderDays: 2 },
      { familyId, createdById: priya.userId, name: 'OTT streaming bundle', amount: 649, frequency: 'MONTHLY', nextDueDate: nextMonthDay(15), category: 'ENTERTAINMENT', paymentMethod: 'CARD', autoCreateExpense: true, reminderDays: 2 },
      { familyId, createdById: rajesh.userId, name: 'School fees - Arjun tuition', amount: 8500, frequency: 'MONTHLY', nextDueDate: nextMonthDay(7), category: 'EDUCATION', paymentMethod: 'UPI', autoCreateExpense: false, reminderDays: 5 },
      { familyId, createdById: rajesh.userId, name: 'LIC premium', amount: 6200, frequency: 'QUARTERLY', nextDueDate: addDays(today, 6), category: 'INSURANCE', paymentMethod: 'BANK_TRANSFER', autoCreateExpense: false, reminderDays: 7 },
      { familyId, createdById: rajesh.userId, name: 'Car insurance renewal', amount: 18500, frequency: 'YEARLY', nextDueDate: addDays(today, 45), category: 'INSURANCE', paymentMethod: 'CARD', autoCreateExpense: false, reminderDays: 14 },
    ],
  });

  // ---- pending payments ----
  const payments = await Promise.all([
    prisma.payment.create({ data: { familyId, createdById: rajesh.userId, name: 'Property tax (half-yearly)', amount: 6800, dueDate: addDays(today, -4), category: 'HOUSING', status: 'OVERDUE', notes: 'Pay online on the municipal portal' } }),
    prisma.payment.create({ data: { familyId, createdById: rajesh.userId, name: 'Credit card bill', amount: 12450, dueDate: today, category: 'BILLS', status: 'PENDING' } }),
    prisma.payment.create({ data: { familyId, createdById: rajesh.userId, name: 'Electricity bill', amount: 3150, dueDate: addDays(today, 3), category: 'ELECTRICITY', status: 'PENDING' } }),
    prisma.payment.create({ data: { familyId, createdById: priya.userId, name: 'Postpaid mobile bill', amount: 799, dueDate: addDays(today, 7), category: 'BILLS', status: 'PENDING' } }),
    prisma.payment.create({ data: { familyId, createdById: rajesh.userId, name: 'College fees - term 2', amount: 24000, dueDate: addDays(today, 12), category: 'EDUCATION', status: 'PENDING', notes: 'Arjun - pay before the late-fee date' } }),
    prisma.payment.create({ data: { familyId, createdById: rajesh.userId, name: 'Two-wheeler service', amount: 2400, dueDate: addDays(today, 18), category: 'TRANSPORTATION', status: 'PENDING' } }),
    prisma.payment.create({ data: { familyId, createdById: priya.userId, name: 'Water bill', amount: 480, dueDate: addDays(today, -8), category: 'WATER', status: 'PAID', paidAt: addDays(today, -7) } }),
  ]);

  // ---- notifications (same dedupe keys as the live alert engine, so no duplicates appear) ----
  const tag = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const seedAlerts = [
    { title: 'Demo data loaded', message: 'This is a demo family with sample data. Explore every page, then add your own records.', severity: 'INFO' as const, dedupeKey: 'seed-welcome' },
    { title: 'Payment overdue', message: 'Property tax (half-yearly) (₹6,800) is overdue. Pay it soon to avoid late fees.', severity: 'CRITICAL' as const, dedupeKey: `payment-overdue:${payments[0].id}` },
    { title: 'Payment due soon', message: 'Credit card bill (₹12,450) is due today.', severity: 'WARNING' as const, dedupeKey: `payment-due:${payments[1].id}` },
    { title: 'Budget exceeded', message: 'Your Shopping budget is exceeded: ₹5,450 spent against ₹5,000.', severity: 'CRITICAL' as const, dedupeKey: `budget-exceeded:SHOPPING:${tag}` },
  ];
  await prisma.notification.createMany({
    data: [rajeshUser, priyaUser, arjunUser].flatMap((u) => seedAlerts.map((a) => ({ userId: u.id, familyId, ...a }))),
    skipDuplicates: true,
  });

  console.log('Demo data ready.');
  console.log(`  Family:   ${FAMILY_NAME}`);
  console.log(`  Login:    ${DEMO_EMAILS[0]}  /  ${DEMO_PASSWORD}   (ADMIN)`);
  console.log(`  Member:   ${DEMO_EMAILS[1]}  /  ${DEMO_PASSWORD}   (MEMBER)`);
  console.log(`  Member:   ${DEMO_EMAILS[2]}  /  ${DEMO_PASSWORD}   (MEMBER)`);
  console.log(`  Records:  ${incomes.length} income, ${expenses.length} expenses, ${budgetPlan.length} budget categories x 6 months`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
