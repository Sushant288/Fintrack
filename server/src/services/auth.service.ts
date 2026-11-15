// M0: Auth service
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { generateTokens } from '../utils/tokens';

export const register = async (data: any) => {
  return { message: 'User registered' };
};

export const login = async (data: any) => {
  return { message: 'User logged in' };
};

export const refreshToken = async (token: string) => {
  return { message: 'Token refreshed' };
};
