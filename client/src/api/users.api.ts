import { api } from './client';
import { normalizeError } from './errors';
import { Envelope, SafeUser, SessionData } from '@/types';
import { ChangePasswordInput } from '@/utils/validators';

export const usersApi = {
  async getMe(): Promise<SafeUser> {
    try {
      const res = await api.get<Envelope<SafeUser>>('/users/me');
      if (!res.data.data) throw new Error('User profile data missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async updateMe(patch: Partial<SafeUser>): Promise<SafeUser> {
    try {
      const res = await api.patch<Envelope<SafeUser>>('/users/me', patch);
      if (!res.data.data) throw new Error('Updated user profile data missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async changePassword(body: ChangePasswordInput): Promise<SessionData> {
    try {
      const res = await api.post<Envelope<SessionData>>('/users/me/change-password', {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword
      });
      if (!res.data.data) throw new Error('New session data missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async deleteAccount(password: string): Promise<void> {
    try {
      await api.delete<Envelope<null>>('/users/me', {
        data: { password }
      });
    } catch (err) {
      throw normalizeError(err);
    }
  }
};
