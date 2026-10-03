import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma', async () => {
  const { createFakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: createFakePrisma() };
});

import { app, auth, fake, request, setupFamily } from './helpers/app';

beforeEach(() => fake.__reset());

const income = (over: Record<string, unknown> = {}) => ({
  amount: 50000,
  source: 'Monthly salary',
  category: 'SALARY',
  date: '2026-09-01',
  description: 'September pay',
  isRecurring: true,
  frequency: 'MONTHLY',
  ...over,
});

describe('Income CRUD', () => {
  it('requires authentication and a family', async () => {
    expect((await request(app).get('/api/income')).status).toBe(401);
  });

  it('creates, reads, updates and deletes an income record', async () => {
    const { admin } = await setupFamily();
    const created = await request(app).post('/api/income').set(auth(admin.token)).send(income());
    expect(created.status).toBe(201);
    expect(created.body.income.amount).toBe(50000);
    expect(created.body.income.memberId).toBe(admin.memberId);
    expect(created.body.income.canEdit).toBe(true);
    const id = created.body.income.id as string;

    const got = await request(app).get(`/api/income/${id}`).set(auth(admin.token));
    expect(got.status).toBe(200);
    expect(got.body.income.source).toBe('Monthly salary');

    const updated = await request(app)
      .put(`/api/income/${id}`)
      .set(auth(admin.token))
      .send(income({ amount: 55000, isRecurring: false, frequency: null }));
    expect(updated.status).toBe(200);
    expect(updated.body.income.amount).toBe(55000);
    expect(updated.body.income.frequency).toBeNull();

    const del = await request(app).delete(`/api/income/${id}`).set(auth(admin.token));
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/income/${id}`).set(auth(admin.token))).status).toBe(404);
  });

  it('validates input', async () => {
    const { admin } = await setupFamily();
    const negative = await request(app).post('/api/income').set(auth(admin.token)).send(income({ amount: -5 }));
    expect(negative.status).toBe(400);
    const noFreq = await request(app).post('/api/income').set(auth(admin.token)).send(income({ frequency: null }));
    expect(noFreq.status).toBe(400);
    const badCat = await request(app).post('/api/income').set(auth(admin.token)).send(income({ category: 'LOTTERY' }));
    expect(badCat.status).toBe(400);
  });

  it('supports search, category filter, sorting and pagination', async () => {
    const { admin } = await setupFamily();
    const rows = [
      income({ source: 'Salary A', amount: 1000, date: '2026-09-01' }),
      income({ source: 'Freelance logo', category: 'FREELANCE', amount: 3000, date: '2026-09-05', isRecurring: false, frequency: null }),
      income({ source: 'Rent', category: 'RENTAL', amount: 2000, date: '2026-09-10' }),
    ];
    for (const r of rows) await request(app).post('/api/income').set(auth(admin.token)).send(r);

    const all = await request(app).get('/api/income?limit=2&page=1').set(auth(admin.token));
    expect(all.body.data).toHaveLength(2);
    expect(all.body.pagination).toMatchObject({ total: 3, totalPages: 2 });
    expect(all.body.summary.totalAmount).toBe(6000);
    expect(all.body.data[0].source).toBe('Rent'); // newest date first

    const cat = await request(app).get('/api/income?category=FREELANCE').set(auth(admin.token));
    expect(cat.body.data).toHaveLength(1);

    const search = await request(app).get('/api/income?search=logo').set(auth(admin.token));
    expect(search.body.data[0].source).toBe('Freelance logo');

    const sorted = await request(app).get('/api/income?sortBy=amount&sortOrder=asc').set(auth(admin.token));
    expect(sorted.body.data.map((d: { amount: number }) => d.amount)).toEqual([1000, 2000, 3000]);

    const ranged = await request(app).get('/api/income?dateFrom=2026-09-04&dateTo=2026-09-30').set(auth(admin.token));
    expect(ranged.body.data).toHaveLength(2);
  });

  it('enforces role rules on the backend', async () => {
    const { admin, member } = await setupFamily();
    const adminRecord = await request(app).post('/api/income').set(auth(admin.token)).send(income());
    const adminId = adminRecord.body.income.id as string;

    // a member can add their own income and sees family records
    const own = await request(app).post('/api/income').set(auth(member.token)).send(income({ source: 'Part-time' }));
    expect(own.status).toBe(201);
    expect(own.body.income.memberId).toBe(member.memberId);
    const list = await request(app).get('/api/income').set(auth(member.token));
    expect(list.body.data).toHaveLength(2);

    // ...but cannot edit or delete the admin's record, nor record income for someone else
    expect((await request(app).put(`/api/income/${adminId}`).set(auth(member.token)).send(income())).status).toBe(403);
    expect((await request(app).delete(`/api/income/${adminId}`).set(auth(member.token))).status).toBe(403);
    const forOther = await request(app).post('/api/income').set(auth(member.token)).send(income({ memberId: admin.memberId }));
    expect(forOther.status).toBe(403);

    // a member can manage their own record; admin can manage any
    const ownId = own.body.income.id as string;
    expect((await request(app).put(`/api/income/${ownId}`).set(auth(member.token)).send(income({ amount: 999 }))).status).toBe(200);
    expect((await request(app).delete(`/api/income/${ownId}`).set(auth(admin.token))).status).toBe(200);
  });

  it('never exposes records from another family', async () => {
    const a = await setupFamily('a');
    const b = await setupFamily('b');
    const rec = await request(app).post('/api/income').set(auth(a.admin.token)).send(income());
    const id = rec.body.income.id as string;
    expect((await request(app).get(`/api/income/${id}`).set(auth(b.admin.token))).status).toBe(404);
    expect((await request(app).delete(`/api/income/${id}`).set(auth(b.admin.token))).status).toBe(404);
    expect((await request(app).get('/api/income').set(auth(b.admin.token))).body.data).toHaveLength(0);
  });
});
