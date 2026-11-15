// M2: Transactions API calls
import api from './client';

export const getTransactionsApi = (params?: any) => api.get('/transactions', { params });
export const createTransactionApi = (data: any) => api.post('/transactions', data);
