// M2: useTransactions React Query hook
import { useQuery } from '@tanstack/react-query';
import { getTransactionsApi } from '../api/transactions.api';

export const useTransactions = (filters?: any) => {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => getTransactionsApi(filters)
  });
};
