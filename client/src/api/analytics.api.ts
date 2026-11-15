// M6: Analytics API calls
import api from './client';

export const getOverviewApi = (params?: any) => api.get('/analytics/overview', { params });
export const getSpendingByCategoryApi = (params?: any) => api.get('/analytics/spending-by-category', { params });
