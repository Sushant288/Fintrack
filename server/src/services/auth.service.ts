import { Prisma, User as PrismaUser } from '@prisma/client';
import { prisma } from '../config/prisma';
import { DEFAULT_CATEGORIES } from './category.defaults';
import { hashPassword, verifyPassword, getDummyHash } from '../utils/password';
import {
  signAccessToken,
  accessTtlSeconds,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate
} from '../utils/tokens';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { RegisterInput, LoginInput } from '../validators/auth.schema';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  alertThresholds: number[];
  alertInAppEnabled: boolean;
  alertEmailEnabled: boolean;
  createdAt: Date;
}

export interface AuthSessionResult {
  user: SafeUser;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export function toSafeUser(user: PrismaUser): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    currency: user.currency,
    timezone: user.timezone,
    alertThresholds: user.alertThresholds,
    alertInAppEnabled: user.alertInAppEnabled,
    alertEmailEnabled: user.alertEmailEnabled,
    createdAt: user.createdAt
  };
}

export async function register(input: RegisterInput): Promise<AuthSessionResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = refreshExpiryDate();

  let createdUser: PrismaUser;

  try {
    createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: normalizedEmail,
          passwordHash,
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {})
        }
      });

      const categoryData = DEFAULT_CATEGORIES.map((c) => ({
        userId: user.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        isDefault: true,
        isArchived: false
      }));

      await tx.category.createMany({ data: categoryData });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });

      return user;
    });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw ApiError.conflict(
        ERROR_CODES.EMAIL_TAKEN,
        'An account with this email address already exists'
      );
    }
    throw err;
  }

  const accessToken = signAccessToken(createdUser.id);
  const expiresIn = accessTtlSeconds();

  return {
    user: toSafeUser(createdUser),
    accessToken,
    expiresIn,
    refreshToken: rawRefreshToken
  };
}

export async function login(input: LoginInput): Promise<AuthSessionResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    await verifyPassword(input.password, getDummyHash());
    throw ApiError.unauthorized(
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid email or password'
    );
  }

  const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized(
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid email or password'
    );
  }

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = refreshExpiryDate();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  // Opportunistic cleanup of expired or revoked tokens for this user
  prisma.refreshToken
    .deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lte: new Date() } },
          { AND: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] }
        ]
      }
    })
    .catch(() => {});

  const accessToken = signAccessToken(user.id);
  const expiresIn = accessTtlSeconds();

  return {
    user: toSafeUser(user),
    accessToken,
    expiresIn,
    refreshToken: rawRefreshToken
  };
}

type RefreshTransactionResult =
  | { kind: 'success'; user: PrismaUser; nextRawToken: string }
  | { kind: 'reuse' }
  | { kind: 'invalid' }
  | { kind: 'expired' };

export async function refresh(rawToken: string | undefined): Promise<AuthSessionResult> {
  if (!rawToken) {
    throw ApiError.unauthorized(
      ERROR_CODES.REFRESH_TOKEN_MISSING,
      'Refresh token cookie is missing'
    );
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const txResult = await prisma.$transaction(async (tx): Promise<RefreshTransactionResult> => {
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!existing) {
      return { kind: 'invalid' };
    }

    // Reuse detection: token was already revoked
    if (existing.revokedAt !== null) {
      await tx.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: now }
      });
      return { kind: 'reuse' };
    }

    // Expiration check (not reuse)
    if (existing.expiresAt <= now) {
      return { kind: 'expired' };
    }

    // Atomic claim: only one concurrent refresh request wins
    const claim = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now }
    });

    if (claim.count !== 1) {
      await tx.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: now }
      });
      return { kind: 'reuse' };
    }

    // Issue new refresh token
    const nextRawToken = generateRefreshToken();
    const nextTokenHash = hashToken(nextRawToken);
    const nextExpiresAt = refreshExpiryDate(now);

    await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: nextTokenHash,
        expiresAt: nextExpiresAt
      }
    });

    return {
      kind: 'success',
      user: existing.user,
      nextRawToken
    };
  });

  if (txResult.kind === 'reuse') {
    throw ApiError.unauthorized(
      ERROR_CODES.REFRESH_TOKEN_REUSED,
      'Refresh token reuse detected; all sessions revoked'
    );
  }

  if (txResult.kind === 'invalid' || txResult.kind === 'expired') {
    throw ApiError.unauthorized(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      'Refresh token is invalid or expired'
    );
  }

  const accessToken = signAccessToken(txResult.user.id);
  const expiresIn = accessTtlSeconds();

  return {
    user: toSafeUser(txResult.user),
    accessToken,
    expiresIn,
    refreshToken: txResult.nextRawToken
  };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  await prisma.refreshToken
    .updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now }
    })
    .catch(() => {});
}
