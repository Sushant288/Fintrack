// M3: Alerts API calls
import api from './client';

export const getAlertsApi = () => api.get('/alerts');
export const markAlertReadApi = (id: string) => api.patch(`/alerts/${id}/read`);
