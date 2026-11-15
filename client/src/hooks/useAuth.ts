// M0: useAuth hook
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export const useAuth = () => useContext(AuthContext);
