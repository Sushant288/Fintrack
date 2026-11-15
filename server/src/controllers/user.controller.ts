import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { getValidated } from '../middleware/validate';
import { UpdateProfileInput } from '../validators/user.schema';
import { ChangePasswordInput, DeleteAccountInput } from '../validators/auth.schema';
import { setRefreshCookie, clearRefreshCookie } from '../utils/cookies';
import { ok } from '../utils/response';

export async function getProfile(req: Request, res: Response): Promise<Response> {
  const result = await userService.getMe(req.user!.id);
  return ok(res, result, null, 200);
}

export async function updateProfile(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<UpdateProfileInput>(req);
  const result = await userService.updateMe(req.user!.id, body);
  return ok(res, result, null, 200);
}

export async function changePassword(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<ChangePasswordInput>(req);
  const result = await userService.changePassword(
    req.user!.id,
    body.currentPassword,
    body.newPassword
  );

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

export async function deleteAccount(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<DeleteAccountInput>(req);
  const result = await userService.deleteAccount(req.user!.id, body.password);

  clearRefreshCookie(res);

  return ok(res, result, null, 200);
}
