import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma', async () => {
  const { createFakePrisma } = await import('./helpers/fakePrisma');
  return { prisma: createFakePrisma() };
});

import { prisma } from '../src/config/prisma';
import { env } from '../src/config/env';
import { authenticate, requireFamily, requireRole } from '../src/middleware/auth';
import { AppError } from '../src/utils/errors';
import { signToken, verifyToken } from '../src/utils/jwt';
import type { FakePrisma } from './helpers/fakePrisma';

const fake = prisma as unknown as FakePrisma;

function run(mw: any, req: any): Promise<unknown> {
  return new Promise((resolve) => mw(req, {} as any, (err?: unknown) => resolve(err)));
}

beforeEach(() => fake.__reset());

describe('JWT helpers', () => {
  it('signs and verifies a token round trip', () => {
    expect(verifyToken(signToken('user-1')).sub).toBe('user-1');
  });
  it('rejects tampered tokens', () => {
    const token = signToken('user-1');
    expect(() => verifyToken(token.slice(0, -2) + 'xx')).toThrow();
  });
});

describe('authenticate middleware', () => {
  it('rejects a missing Authorization header', async () => {
    const err = (await run(authenticate, { headers: {} })) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const err = (await run(authenticate, { headers: { authorization: 'Bearer not.a.token' } })) as AppError;
    expect(err.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: 'u1' }, env.JWT_SECRET, { expiresIn: -10 });
    const err = (await run(authenticate, { headers: { authorization: `Bearer ${expired}` } })) as AppError;
    expect(err.status).toBe(401);
  });

  it('rejects a token for a user that no longer exists', async () => {
    const err = (await run(authenticate, { headers: { authorization: `Bearer ${signToken('ghost')}` } })) as AppError;
    expect(err.status).toBe(401);
  });

  it('attaches the user, role and family for a valid token', async () => {
    const u = await fake.user.create({ data: { name: 'A', email: 'a@x.com', passwordHash: 'h' } });
    const f = await fake.family.create({ data: { name: 'F' } });
    const m = await fake.familyMember.create({ data: { familyId: f.id, userId: u.id, role: 'ADMIN' } });
    const req: any = { headers: { authorization: `Bearer ${signToken(u.id)}` } };
    expect(await run(authenticate, req)).toBeUndefined();
    expect(req.user).toMatchObject({ id: u.id, role: 'ADMIN', familyId: f.id, memberId: m.id });
  });
});

describe('authorization middleware', () => {
  it('requireRole blocks members from admin-only actions', async () => {
    const err = (await run(requireRole('ADMIN'), { user: { role: 'MEMBER' } })) as AppError;
    expect(err.status).toBe(403);
    expect(await run(requireRole('ADMIN'), { user: { role: 'ADMIN' } })).toBeUndefined();
  });

  it('requireFamily blocks users without a family', async () => {
    const err = (await run(requireFamily, { user: { role: 'MEMBER', familyId: null, memberId: null } })) as AppError;
    expect(err.status).toBe(403);
    expect(err.code).toBe('NO_FAMILY');
  });
});
