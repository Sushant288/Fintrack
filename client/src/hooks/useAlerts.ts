// M3: useAlerts React Query hook
import { useQuery } from '@tanstack/react-query';
import { getAlertsApi } from '../api/alerts.api';

export const useAlerts = () => {
  return useQuery({ queryKey: ['alerts'], queryFn: getAlertsApi });
};
