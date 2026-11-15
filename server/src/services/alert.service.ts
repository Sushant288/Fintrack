// M3: Alert service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.alert.findMany({ where: { userId } });
};

export const markAsRead = async (userId: string, id: string) => {
  return prisma.alert.update({ where: { id }, data: { isRead: true } });
};
