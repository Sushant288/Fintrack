// M2: Transaction service
import { prisma } from '../config/prisma';

export const getAll = async (userId: string) => {
  return prisma.transaction.findMany({ where: { userId } });
};

export const getById = async (userId: string, id: string) => {
  return prisma.transaction.findFirst({ where: { id, userId } });
};

export const create = async (userId: string, data: any) => {
  return prisma.transaction.create({ data: { ...data, userId } });
};

export const update = async (userId: string, id: string, data: any) => {
  return prisma.transaction.update({ where: { id }, data });
};

export const remove = async (userId: string, id: string) => {
  return prisma.transaction.delete({ where: { id } });
};
