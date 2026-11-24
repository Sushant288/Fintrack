import { bare, refreshSession } from './client';
import { normalizeError } from './errors';
import { Envelope, SessionData } from '@/types';
import { LoginInput } from '@/utils/validators';

export const authApi = {
  async login(body: LoginInput): Promise<SessionData> {
    try {
      const res = await bare.post<Envelope<SessionData>>('/auth/login', body);
      if (!res.data.data) throw new Error('Missing session data in response');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async register(body: {
    name: string;
    email: string;
    password: string;
    currency?: string;
    timezone?: string;
  }): Promise<SessionData> {
    try {
      const res = await bare.post<Envelope<SessionData>>('/auth/register', body);
      if (!res.data.data) throw new Error('Missing session data in response');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async logout(): Promise<void> {
    try {
      await bare.post<Envelope<null>>('/auth/logout');
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async refresh(): Promise<SessionData> {
    return refreshSession();
  }
};
