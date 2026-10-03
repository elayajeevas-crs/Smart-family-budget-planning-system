import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import * as auth from '../controllers/auth.controller';
import * as family from '../controllers/family.controller';
import * as income from '../controllers/income.controller';
import * as expense from '../controllers/expense.controller';
import * as budget from '../controllers/budget.controller';
import * as savings from '../controllers/savings.controller';
import * as recurring from '../controllers/recurring.controller';
import * as payment from '../controllers/payment.controller';
import * as notification from '../controllers/notification.controller';
import * as analytics from '../controllers/analytics.controller';
import * as report from '../controllers/report.controller';
import { listTransactions } from '../controllers/transaction.controller';
import { authenticate, requireFamily, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { changePasswordSchema, loginSchema, profileSchema, registerSchema } from '../validators/auth';
import { budgetSchema } from '../validators/budget';
import { idParam, monthYearQuery, paginationQuery, rangeQuery } from '../validators/common';
import { expenseListQuery, expenseSchema } from '../validators/expense';
import { addMemberSchema, familySchema, updateMemberSchema } from '../validators/family';
import { incomeListQuery, incomeSchema } from '../validators/income';
import { markPaidSchema, paymentListQuery, paymentSchema } from '../validators/payment';
import { recurringSchema } from '../validators/recurring';
import { contributionSchema, savingsGoalSchema } from '../validators/savings';
import { transactionQuery } from '../validators/transactions';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

const admin = requireRole('ADMIN');
const id = validate({ params: idParam });

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'smart-family-budget-api', time: new Date().toISOString() });
});

// ---- Auth ----
router.post('/auth/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/auth/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, auth.me);
router.put('/auth/profile', authenticate, validate({ body: profileSchema }), auth.updateProfile);
router.put('/auth/change-password', authenticate, validate({ body: changePasswordSchema }), auth.changePassword);

// Everything below requires a signed-in user.
router.use(authenticate);

// ---- Family ----
router.get('/family', family.getFamily);
router.post('/family', validate({ body: familySchema }), family.createFamily);
router.put('/family', requireFamily, admin, validate({ body: familySchema }), family.updateFamily);
router.get('/family/members', requireFamily, family.listMembers);
router.post('/family/members', requireFamily, admin, validate({ body: addMemberSchema }), family.addMember);
router.put('/family/members/:id', requireFamily, admin, validate({ params: idParam, body: updateMemberSchema }), family.updateMember);
router.delete('/family/members/:id', requireFamily, admin, id, family.removeMember);

// Everything below requires the user to belong to a family.
router.use(requireFamily);

// ---- Income ----
router.get('/income', validate({ query: incomeListQuery }), income.listIncome);
router.post('/income', validate({ body: incomeSchema }), income.createIncome);
router.get('/income/:id', id, income.getIncome);
router.put('/income/:id', validate({ params: idParam, body: incomeSchema }), income.updateIncome);
router.delete('/income/:id', id, income.deleteIncome);

// ---- Expenses ----
router.get('/expenses', validate({ query: expenseListQuery }), expense.listExpenses);
router.post('/expenses', validate({ body: expenseSchema }), expense.createExpense);
router.get('/expenses/:id', id, expense.getExpense);
router.put('/expenses/:id', validate({ params: idParam, body: expenseSchema }), expense.updateExpense);
router.delete('/expenses/:id', id, expense.deleteExpense);

// ---- Transactions (unified) ----
router.get('/transactions', validate({ query: transactionQuery }), listTransactions);

// ---- Budgets ----
router.get('/budgets', validate({ query: monthYearQuery }), budget.getBudgets);
router.post('/budgets', admin, validate({ body: budgetSchema }), budget.createBudget);
router.put('/budgets/:id', admin, validate({ params: idParam, body: budgetSchema }), budget.updateBudget);
router.delete('/budgets/:id', admin, id, budget.deleteBudget);

// ---- Savings goals ----
router.get('/savings-goals', savings.listGoals);
router.post('/savings-goals', admin, validate({ body: savingsGoalSchema }), savings.createGoal);
router.get('/savings-goals/:id', id, savings.getGoal);
router.put('/savings-goals/:id', admin, validate({ params: idParam, body: savingsGoalSchema }), savings.updateGoal);
router.delete('/savings-goals/:id', admin, id, savings.deleteGoal);
router.post('/savings-goals/:id/contribute', admin, validate({ params: idParam, body: contributionSchema }), savings.contribute);

// ---- Recurring expenses ----
router.get('/recurring', recurring.listRecurring);
router.post('/recurring', admin, validate({ body: recurringSchema }), recurring.createRecurring);
router.post('/recurring/process', admin, recurring.processRecurringNow);
router.put('/recurring/:id', admin, validate({ params: idParam, body: recurringSchema }), recurring.updateRecurring);
router.delete('/recurring/:id', admin, id, recurring.deleteRecurring);

// ---- Pending payments ----
router.get('/payments', validate({ query: paymentListQuery }), payment.listPayments);
router.post('/payments', admin, validate({ body: paymentSchema }), payment.createPayment);
router.get('/payments/:id', id, payment.getPayment);
router.put('/payments/:id', admin, validate({ params: idParam, body: paymentSchema }), payment.updatePayment);
router.delete('/payments/:id', admin, id, payment.deletePayment);
router.post('/payments/:id/mark-paid', admin, validate({ params: idParam, body: markPaidSchema }), payment.markPaid);

// ---- Notifications ----
const notificationQuery = paginationQuery.extend({
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
router.get('/notifications', validate({ query: notificationQuery }), notification.listNotifications);
router.put('/notifications/read-all', notification.markAllRead);
router.put('/notifications/:id/read', id, notification.markRead);

// ---- Analytics ----
router.get('/analytics/dashboard', validate({ query: monthYearQuery }), analytics.getDashboard);
router.get('/analytics/monthly', validate({ query: rangeQuery }), analytics.getMonthly);
router.get('/analytics/categories', validate({ query: rangeQuery }), analytics.getCategories);
router.get('/analytics/cashflow', validate({ query: rangeQuery }), analytics.getCashflow);

// ---- Reports ----
router.get('/reports/monthly', validate({ query: monthYearQuery }), report.monthlyReport);
router.get('/reports/expenses', validate({ query: rangeQuery }), report.expenseReport);
router.get('/reports/income', validate({ query: rangeQuery }), report.incomeReport);
router.get('/reports/budget', validate({ query: monthYearQuery }), report.budgetReport);
router.get('/reports/savings', validate({ query: rangeQuery }), report.savingsReport);

export default router;
