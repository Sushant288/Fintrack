// M4: Recurring transactions API calls
import api from './client';

export const getRecurringApi = () => api.get('/recurring');
export const createRecurringApi = (data: any) => api.post('/recurring', data);
