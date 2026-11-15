// M0: JWT token helpers
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const generateTokens = (payload: object) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): any => {
  return jwt.verify(token, env.JWT_SECRET);
};
