import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { getValidated } from '../middleware/validate';
import { RegisterInput, LoginInput } from '../validators/auth.schema';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from '../utils/cookies';
import { ok } from '../utils/response';

export async function register(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<RegisterInput>(req);
  const result = await authService.register(body);

  setRefreshCookie(res, result.refreshToken);

  return ok(
    res,
    {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    },
    null,
    201
  );
}

export async function login(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<LoginInput>(req);
  const result = await authService.login(body);

  setRefreshCookie(res, result.refreshToken);

  return ok(
    res,
    {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    },
    null,
    200
  );
}

export async function refresh(req: Request, res: Response): Promise<Response> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  const result = await authService.refresh(rawToken);

  setRefreshCookie(res, result.refreshToken);

  return ok(
    res,
    {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    },
    null,
    200
  );
}

export async function logout(req: Request, res: Response): Promise<Response> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logout(rawToken);

  clearRefreshCookie(res);

  return ok(res, { loggedOut: true }, null, 200);
}
