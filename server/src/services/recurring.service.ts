// M4: Recurring service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.recurring.findMany({ where: { userId } });
};

export const create = async (userId: string, data: any) => {
  return prisma.recurring.create({ data: { ...data, userId } });
};

export const update = async (userId: string, id: string, data: any) => {
  return prisma.recurring.update({ where: { id }, data });
};

export const remove = async (userId: string, id: string) => {
  return prisma.recurring.delete({ where: { id } });
};
