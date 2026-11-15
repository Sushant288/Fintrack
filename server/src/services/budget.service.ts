// M3: Budget service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.budget.findMany({ where: { userId } });
};

export const create = async (userId: string, data: any) => {
  return prisma.budget.create({ data: { ...data, userId } });
};

export const update = async (userId: string, id: string, data: any) => {
  return prisma.budget.update({ where: { id }, data });
};

export const remove = async (userId: string, id: string) => {
  return prisma.budget.delete({ where: { id } });
};
