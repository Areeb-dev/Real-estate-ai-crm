import { prisma } from "../config/prisma";

export async function listNotifications(userId?: string, limit = 30) {
  return prisma.notification.findMany({
    where: userId
      ? { OR: [{ userId }, { userId: null }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllRead(userId?: string) {
  await prisma.notification.updateMany({
    where: userId
      ? { OR: [{ userId }, { userId: null }], isRead: false }
      : { isRead: false },
    data: { isRead: true },
  });
  return { success: true };
}
