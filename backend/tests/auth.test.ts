import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma', async () => {
  const { createFakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: createFakePrisma() };
});

import { PASSWORD, app, auth, fake, registerUser, request } from './helpers/app';

beforeEach(() => fake.__reset());

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token without exposing the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: 'ASHA@Example.com', password: PASSWORD, confirmPassword: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('asha@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    // stored password is hashed, never plain text
    const stored = fake.__db.user.rows[0];
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate emails', async () => {
    await registerUser('One', 'dup@example.com');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Two', email: 'dup@example.com', password: PASSWORD, confirmPassword: PASSWORD });
    expect(res.status).toBe(409);
  });

  it('validates email, password strength and confirmation', async () => {
    const bad = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X Y', email: 'not-an-email', password: 'weak', confirmPassword: 'different' });
    expect(bad.status).toBe(400);
    const paths = bad.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'confirmPassword']));
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials', async () => {
    await registerUser('Login User', 'login@example.com');
    const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.name).toBe('Login User');
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await registerUser('Login User', 'login2@example.com');
    const wrong = await request(app).post('/api/auth/login').send({ email: 'login2@example.com', password: 'Wrong1234' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });
});

describe('GET /api/auth/me and password change', () => {
  it('returns the current user for a valid token and 401 otherwise', async () => {
    const { token } = await registerUser('Me User', 'me@example.com');
    const ok = await request(app).get('/api/auth/me').set(auth(token));
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('me@example.com');
    expect(ok.body.user.family).toBeNull();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('changes the password and requires the correct current one', async () => {
    const { token } = await registerUser('Pw User', 'pw@example.com');
    const wrong = await request(app)
      .put('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'Nope12345', newPassword: 'NewStrong9', confirmPassword: 'NewStrong9' });
    expect(wrong.status).toBe(400);

    const ok = await request(app)
      .put('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: PASSWORD, newPassword: 'NewStrong9', confirmPassword: 'NewStrong9' });
    expect(ok.status).toBe(200);

    const relog = await request(app).post('/api/auth/login').send({ email: 'pw@example.com', password: 'NewStrong9' });
    expect(relog.status).toBe(200);
    const old = await request(app).post('/api/auth/login').send({ email: 'pw@example.com', password: PASSWORD });
    expect(old.status).toBe(401);
  });

  it('logout responds successfully', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});
