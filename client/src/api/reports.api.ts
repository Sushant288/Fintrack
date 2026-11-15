// M8: Reports API calls
import api from './client';

export const getMonthlyReportApi = () => api.get('/reports/monthly');
