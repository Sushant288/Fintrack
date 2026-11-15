// M3: Budgets API calls
import api from './client';

export const getBudgetsApi = () => api.get('/budgets');
export const createBudgetApi = (data: any) => api.post('/budgets', data);
