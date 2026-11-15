// M0: Auth API calls
import api from './client';

export const loginApi = (credentials: any) => api.post('/auth/login', credentials);
export const registerApi = (data: any) => api.post('/auth/register', data);
