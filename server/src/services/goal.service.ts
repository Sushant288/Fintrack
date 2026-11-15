// M5: Goal service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.goal.findMany({ where: { userId } });
};

export const create = async (userId: string, data: any) => {
  return prisma.goal.create({ data: { ...data, userId } });
};

export const update = async (userId: string, id: string, data: any) => {
  return prisma.goal.update({ where: { id }, data });
};

export const remove = async (userId: string, id: string) => {
  return prisma.goal.delete({ where: { id } });
};
