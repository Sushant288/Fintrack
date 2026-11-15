// M5: useGoals React Query hook
import { useQuery } from '@tanstack/react-query';
import { getGoalsApi } from '../api/goals.api';

export const useGoals = () => {
  return useQuery({ queryKey: ['goals'], queryFn: getGoalsApi });
};
