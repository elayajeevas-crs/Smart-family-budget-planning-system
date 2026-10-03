import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { signToken } from '../utils/jwt';

async function buildUserDto(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { membership: { include: { family: true } } },
  });
  if (!user) throw new AppError(404, 'User not found');
  // Never expose passwordHash.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.membership?.role ?? user.role,
    familyId: user.membership?.familyId ?? null,
    memberId: user.membership?.id ?? null,
    family: user.membership?.family
      ? { id: user.membership.family.id, name: user.membership.family.name }
      : null,
    createdAt: user.createdAt,
  };
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  res.status(201).json({ token: signToken(user.id), user: await buildUserDto(user.id) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new AppError(401, 'Invalid email or password');
  res.json({ token: signToken(user.id), user: await buildUserDto(user.id) });
});

// JWTs are stateless: logging out is completed by the client discarding its token.
export const logout = asyncHandler(async (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: await buildUserDto(req.user!.id) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body as { name: string; email: string };
  const userId = req.user!.id;
  if (email !== req.user!.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== userId) throw new AppError(409, 'That email is already in use');
  }
  await prisma.user.update({ where: { id: userId }, data: { name, email } });
  res.json({ user: await buildUserDto(userId) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError(404, 'User not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(400, 'Current password is incorrect', undefined, [
    { path: 'currentPassword', message: 'Current password is incorrect' },
  ]);
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ message: 'Password updated successfully' });
});
