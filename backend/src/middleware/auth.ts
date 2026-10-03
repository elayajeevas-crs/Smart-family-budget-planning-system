import type { Request, RequestHandler } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyToken } from '../utils/jwt';

/** Verifies the Bearer token and attaches the current user (with family role) to the request. */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw new AppError(401, 'Authentication required');

  let userId: string;
  try {
    userId = verifyToken(header.slice(7)).sub;
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { membership: true } });
  if (!user) throw new AppError(401, 'Account no longer exists');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.membership?.role ?? user.role,
    familyId: user.membership?.familyId ?? null,
    memberId: user.membership?.id ?? null,
  };
  next();
});

/** Allows only the listed roles. Must run after `authenticate`. */
export const requireRole =
  (...roles: Array<'ADMIN' | 'MEMBER'>): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
    }
    next();
  };

/** Requires the user to belong to a family. */
export const requireFamily: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'Authentication required'));
  if (!req.user.familyId || !req.user.memberId) {
    return next(new AppError(403, 'Create or join a family first', 'NO_FAMILY'));
  }
  next();
};

/** Typed accessor for authenticated, family-scoped requests. */
export function ctx(req: Request) {
  const u = req.user;
  if (!u) throw new AppError(401, 'Authentication required');
  if (!u.familyId || !u.memberId) throw new AppError(403, 'Create or join a family first', 'NO_FAMILY');
  return {
    user: u,
    userId: u.id,
    familyId: u.familyId,
    memberId: u.memberId,
    isAdmin: u.role === 'ADMIN',
  };
}

export type Ctx = ReturnType<typeof ctx>;

/** Members may only modify records they created; admins may modify any family record. */
export function assertCanModify(c: Ctx, createdById: string): void {
  if (!c.isAdmin && createdById !== c.userId) {
    throw new AppError(403, 'You can only modify records you created', 'FORBIDDEN');
  }
}
