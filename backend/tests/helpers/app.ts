import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import type { FakePrisma } from './fakePrisma';

export const app = createApp();
export const fake = prisma as unknown as FakePrisma;

export const PASSWORD = 'Str0ngPass1';

export async function registerUser(name: string, email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: PASSWORD, confirmPassword: PASSWORD });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

/** Creates a family in the fake DB with one ADMIN and one MEMBER, both registered through the real API. */
export async function setupFamily(suffix = '1') {
  const admin = await registerUser('Admin User', `admin${suffix}@example.com`);
  const member = await registerUser('Member User', `member${suffix}@example.com`);
  const family = await fake.family.create({ data: { name: `Test Family ${suffix}` } });
  const adminMember = await fake.familyMember.create({ data: { familyId: family.id, userId: admin.id, role: 'ADMIN' } });
  const memberMember = await fake.familyMember.create({ data: { familyId: family.id, userId: member.id, role: 'MEMBER' } });
  return {
    familyId: family.id as string,
    admin: { ...admin, memberId: adminMember.id as string },
    member: { ...member, memberId: memberMember.id as string },
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export { request };
