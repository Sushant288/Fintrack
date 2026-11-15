// M6: Analytics service
import { prisma } from '../config/prisma';

export const getOverview = async (userId: string) => {
  return { balance: 0, totalIncome: 0, totalExpenses: 0 };
};

export const getSpendingByCategory = async (userId: string) => {
  return [];
};

export const getIncomeVsExpense = async (userId: string) => {
  return [];
};
