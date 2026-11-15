// M1: Categories API calls
import api from './client';

export const getCategoriesApi = () => api.get('/categories');
export const createCategoryApi = (data: any) => api.post('/categories', data);
