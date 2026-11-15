// M6: useAnalytics React Query hook
import { useQuery } from '@tanstack/react-query';
import { getOverviewApi } from '../api/analytics.api';

export const useAnalytics = (range?: any) => {
  return useQuery({ queryKey: ['analytics', range], queryFn: () => getOverviewApi(range) });
};
