import { prisma } from '../config/prisma';
import { syncNotifications } from '../services/notification.service';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { paginate } from '../validators/common';

export const listNotifications = asyncHandler(async (req, res) => {
  const u = req.user!;
  if (u.familyId) await syncNotifications(u.familyId);
  const q = req.query as unknown as { page: number; limit: number; unread?: boolean };
  const where = { userId: u.id, ...(q.unread ? { isRead: false } : {}) };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: u.id, isRead: false } }),
  ]);
  res.json({ data: rows, unreadCount, pagination: paginate(total, q.page, q.limit) });
});

export const markRead = asyncHandler(async (req, res) => {
  const u = req.user!;
  const existing = await prisma.notification.findFirst({ where: { id: req.params.id, userId: u.id } });
  if (!existing) throw new AppError(404, 'Notification not found');
  const notification = await prisma.notification.update({ where: { id: existing.id }, data: { isRead: true } });
  res.json({ notification });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ updated: result.count });
});
