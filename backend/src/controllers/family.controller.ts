import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ctx } from '../middleware/auth';
import { fetchRange, sum } from '../services/stats.service';
import { currentYearMonth } from '../utils/clock';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { monthRange, round2, savingsMetrics } from '../utils/finance';
import { num } from '../utils/serialize';

export const getFamily = asyncHandler(async (req, res) => {
  const u = req.user!;
  if (!u.familyId) return res.json({ family: null, role: u.role });

  const family = await prisma.family.findUnique({
    where: { id: u.familyId },
    include: { _count: { select: { members: true } } },
  });
  if (!family) return res.json({ family: null, role: u.role });

  const { year, month } = currentYearMonth();
  const { start, end } = monthRange(year, month);
  const [range, goals] = await Promise.all([
    fetchRange(family.id, start, end),
    prisma.savingsGoal.findMany({ where: { familyId: family.id }, select: { currentAmount: true, targetAmount: true } }),
  ]);
  const m = savingsMetrics(sum(range.incomes), sum(range.expenses));

  res.json({
    role: u.role,
    family: {
      id: family.id,
      name: family.name,
      description: family.description,
      createdAt: family.createdAt,
      memberCount: family._count.members,
    },
    financials: {
      month,
      year,
      income: m.income,
      expenses: m.expenses,
      balance: m.balance,
      savingsRate: m.savingsRate,
      goalsSaved: round2(goals.reduce((s, g) => s + num(g.currentAmount), 0)),
      goalsTarget: round2(goals.reduce((s, g) => s + num(g.targetAmount), 0)),
    },
  });
});

export const createFamily = asyncHandler(async (req, res) => {
  const u = req.user!;
  if (u.familyId) throw new AppError(409, 'You already belong to a family');
  const { name, description } = req.body as { name: string; description: string | null };

  const family = await prisma.family.create({
    data: { name, description, members: { create: { userId: u.id, role: 'ADMIN' } } },
  });
  await prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
  res.status(201).json({ family: { id: family.id, name: family.name, description: family.description } });
});

export const updateFamily = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const { name, description } = req.body as { name: string; description: string | null };
  const family = await prisma.family.update({ where: { id: c.familyId }, data: { name, description } });
  res.json({ family: { id: family.id, name: family.name, description: family.description } });
});

export const listMembers = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const { year, month } = currentYearMonth();
  const { start, end } = monthRange(year, month);
  const [members, range] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId: c.familyId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    fetchRange(c.familyId, start, end),
  ]);

  res.json({
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
      monthIncome: sum(range.incomes.filter((r) => r.memberId === m.id)),
      monthExpenses: sum(range.expenses.filter((r) => r.memberId === m.id)),
      isYou: m.userId === c.userId,
    })),
  });
});

export const addMember = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const { email, name, password, role } = req.body as {
    email: string;
    name?: string;
    password?: string;
    role: 'ADMIN' | 'MEMBER';
  };

  const existing = await prisma.user.findUnique({ where: { email }, include: { membership: true } });
  let userId: string;
  if (existing) {
    if (existing.membership) throw new AppError(409, 'This person already belongs to a family');
    userId = existing.id;
  } else {
    if (!name || !password) {
      throw new AppError(400, 'Name and an initial password are required to create a new account', undefined, [
        { path: !name ? 'name' : 'password', message: 'Required for new accounts' },
      ]);
    }
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    userId = (await prisma.user.create({ data: { name, email, passwordHash, role } })).id;
  }

  const member = await prisma.familyMember.create({
    data: { familyId: c.familyId, userId, role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  await prisma.user.update({ where: { id: userId }, data: { role } });

  res.status(201).json({
    member: { id: member.id, userId, name: member.user.name, email: member.user.email, role: member.role, joinedAt: member.createdAt },
  });
});

async function adminCount(familyId: string): Promise<number> {
  return prisma.familyMember.count({ where: { familyId, role: 'ADMIN' } });
}

export const updateMember = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const { role } = req.body as { role: 'ADMIN' | 'MEMBER' };
  const member = await prisma.familyMember.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!member) throw new AppError(404, 'Member not found');
  if (member.role === 'ADMIN' && role === 'MEMBER' && (await adminCount(c.familyId)) <= 1) {
    throw new AppError(400, 'A family must keep at least one admin');
  }
  await prisma.familyMember.update({ where: { id: member.id }, data: { role } });
  await prisma.user.update({ where: { id: member.userId }, data: { role } });
  res.json({ message: 'Member role updated' });
});

export const removeMember = asyncHandler(async (req, res) => {
  const c = ctx(req);
  const member = await prisma.familyMember.findFirst({ where: { id: req.params.id, familyId: c.familyId } });
  if (!member) throw new AppError(404, 'Member not found');
  if (member.role === 'ADMIN' && (await adminCount(c.familyId)) <= 1) {
    throw new AppError(400, 'You cannot remove the only admin. Promote another member first.');
  }
  await prisma.familyMember.delete({ where: { id: member.id } });
  await prisma.user.update({ where: { id: member.userId }, data: { role: 'MEMBER' } });
  res.json({ message: 'Member removed' });
});
