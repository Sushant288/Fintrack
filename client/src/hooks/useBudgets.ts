// M3: useBudgets React Query hook
import { useQuery } from '@tanstack/react-query';
import { getBudgetsApi } from '../api/budgets.api';

export const useBudgets = () => {
  return useQuery({ queryKey: ['budgets'], queryFn: getBudgetsApi });
};
