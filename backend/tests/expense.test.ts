import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma', async () => {
  const { createFakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: createFakePrisma() };
});

import { app, auth, fake, request, setupFamily } from './helpers/app';

beforeEach(() => fake.__reset());

const expense = (over: Record<string, unknown> = {}) => ({
  amount: 1250.5,
  category: 'FOOD',
  description: 'Dinner out',
  date: '2026-09-12',
  paymentMethod: 'UPI',
  notes: 'Birthday',
  ...over,
});

describe('Expense CRUD', () => {
  it('creates, reads, updates and deletes an expense', async () => {
    const { admin } = await setupFamily();
    const created = await request(app).post('/api/expenses').set(auth(admin.token)).send(expense());
    expect(created.status).toBe(201);
    expect(created.body.expense.amount).toBe(1250.5);
    expect(created.body.expense.paymentMethod).toBe('UPI');
    const id = created.body.expense.id as string;

    const upd = await request(app)
      .put(`/api/expenses/${id}`)
      .set(auth(admin.token))
      .send(expense({ amount: 999, category: 'GROCERIES', paymentMethod: 'CARD' }));
    expect(upd.status).toBe(200);
    expect(upd.body.expense).toMatchObject({ amount: 999, category: 'GROCERIES', paymentMethod: 'CARD' });

    expect((await request(app).delete(`/api/expenses/${id}`).set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get(`/api/expenses/${id}`).set(auth(admin.token))).status).toBe(404);
  });

  it('validates input', async () => {
    const { admin } = await setupFamily();
    expect((await request(app).post('/api/expenses').set(auth(admin.token)).send(expense({ amount: 0 }))).status).toBe(400);
    expect((await request(app).post('/api/expenses').set(auth(admin.token)).send(expense({ description: '' }))).status).toBe(400);
    expect((await request(app).post('/api/expenses').set(auth(admin.token)).send(expense({ category: 'CRYPTO' }))).status).toBe(400);
    expect((await request(app).post('/api/expenses').set(auth(admin.token)).send(expense({ date: 'yesterday-ish' }))).status).toBe(400);
  });

  it('filters by category, payment method and date range, and paginates', async () => {
    const { admin } = await setupFamily();
    const data = [
      expense({ description: 'Pizza', amount: 500, date: '2026-09-01' }),
      expense({ description: 'Petrol', category: 'TRANSPORTATION', paymentMethod: 'CARD', amount: 2000, date: '2026-09-10' }),
      expense({ description: 'Bus pass', category: 'TRANSPORTATION', paymentMethod: 'CASH', amount: 700, date: '2026-09-20' }),
    ];
    for (const d of data) await request(app).post('/api/expenses').set(auth(admin.token)).send(d);

    const cat = await request(app).get('/api/expenses?category=TRANSPORTATION').set(auth(admin.token));
    expect(cat.body.data).toHaveLength(2);
    expect(cat.body.summary.totalAmount).toBe(2700);

    const method = await request(app).get('/api/expenses?paymentMethod=CASH').set(auth(admin.token));
    expect(method.body.data).toHaveLength(1);

    const range = await request(app).get('/api/expenses?dateFrom=2026-09-05&dateTo=2026-09-15').set(auth(admin.token));
    expect(range.body.data[0].description).toBe('Petrol');

    const page = await request(app).get('/api/expenses?limit=2&page=2').set(auth(admin.token));
    expect(page.body.data).toHaveLength(1);
    expect(page.body.pagination.totalPages).toBe(2);

    const search = await request(app).get('/api/expenses?search=bus').set(auth(admin.token));
    expect(search.body.data).toHaveLength(1);
  });

  it('lets members manage only their own expenses', async () => {
    const { admin, member } = await setupFamily();
    const adminExp = await request(app).post('/api/expenses').set(auth(admin.token)).send(expense());
    const own = await request(app).post('/api/expenses').set(auth(member.token)).send(expense({ description: 'Snacks' }));
    expect(own.status).toBe(201);
    const adminId = adminExp.body.expense.id as string;
    const ownId = own.body.expense.id as string;

    expect((await request(app).put(`/api/expenses/${adminId}`).set(auth(member.token)).send(expense())).status).toBe(403);
    expect((await request(app).delete(`/api/expenses/${adminId}`).set(auth(member.token))).status).toBe(403);
    expect((await request(app).delete(`/api/expenses/${ownId}`).set(auth(member.token))).status).toBe(200);
  });

  it('blocks members from admin-only endpoints (budgets, payments, family management)', async () => {
    const { member } = await setupFamily();
    const budget = await request(app)
      .post('/api/budgets')
      .set(auth(member.token))
      .send({ month: 9, year: 2026, totalAmount: 1000, categories: [] });
    expect(budget.status).toBe(403);
    const payment = await request(app)
      .post('/api/payments')
      .set(auth(member.token))
      .send({ name: 'Rent', amount: 100, dueDate: '2026-10-01', category: 'HOUSING' });
    expect(payment.status).toBe(403);
    const addMember = await request(app)
      .post('/api/family/members')
      .set(auth(member.token))
      .send({ email: 'new@example.com', name: 'New', password: 'Str0ngPass1', role: 'MEMBER' });
    expect(addMember.status).toBe(403);
  });
});
