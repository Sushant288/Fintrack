import { prisma } from '../config/prisma';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  signAccessToken,
  accessTtlSeconds,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate
} from '../utils/tokens';
import { SafeUser, toSafeUser, AuthSessionResult } from './auth.service';
import { UpdateProfileInput } from '../validators/user.schema';

export async function getMe(userId: string): Promise<{ user: SafeUser }> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'User account no longer exists'
    );
  }

  return { user: toSafeUser(user) };
}

export async function updateMe(
  userId: string,
  data: UpdateProfileInput
): Promise<{ user: SafeUser }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data
  });

  return { user: toSafeUser(user) };
}

export async function changePassword(
  userId: string,
  currentPass: string,
  newPass: string
): Promise<AuthSessionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'User account not found'
    );
  }

  // Golden Rule 5: A wrong CURRENT PASSWORD returns 400 CURRENT_PASSWORD_INCORRECT (never 401)
  const isCurrentValid = await verifyPassword(currentPass, user.passwordHash);
  if (!isCurrentValid) {
    throw ApiError.badRequest(
      ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
      'Current password provided is incorrect'
    );
  }

  const isSamePassword = await verifyPassword(newPass, user.passwordHash);
  if (isSamePassword) {
    throw ApiError.badRequest(
      ERROR_CODES.SAME_PASSWORD,
      'New password cannot be identical to current password'
    );
  }

  const newHash = await hashPassword(newPass);
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = refreshExpiryDate();
  const now = new Date();

  const updatedUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { passwordHash: newHash }
    });

    // Revoke all existing sessions across all devices
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    });

    // Issue a fresh session for the current client device
    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt
      }
    });

    return u;
  });

  const accessToken = signAccessToken(updatedUser.id);
  const expiresIn = accessTtlSeconds();

  return {
    user: toSafeUser(updatedUser),
    accessToken,
    expiresIn,
    refreshToken: rawRefreshToken
  };
}

export async function deleteAccount(
  userId: string,
  passwordConfirm: string
): Promise<{ deleted: true }> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'User account not found'
    );
  }

  const isPasswordValid = await verifyPassword(passwordConfirm, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.badRequest(
      ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
      'Password provided is incorrect'
    );
  }

  // Deleting user cascades to all related entities in PostgreSQL
  await prisma.user.delete({
    where: { id: userId }
  });

  return { deleted: true };
}
