// M1: Category service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.category.findMany({
    where: { OR: [{ userId }, { isDefault: true }] }
  });
};

export const create = async (userId: string, data: any) => {
  return prisma.category.create({ data: { ...data, userId } });
};

export const update = async (userId: string, id: string, data: any) => {
  return prisma.category.update({ where: { id }, data });
};

export const remove = async (userId: string, id: string) => {
  return prisma.category.delete({ where: { id } });
};
