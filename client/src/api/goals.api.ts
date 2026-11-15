// M5: Goals API calls
import api from './client';

export const getGoalsApi = () => api.get('/goals');
export const createGoalApi = (data: any) => api.post('/goals', data);
