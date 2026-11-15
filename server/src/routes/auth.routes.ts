import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { registerLimiter, loginLimiter } from '../middleware/rateLimit';
import { originGuard } from '../middleware/originGuard';
import { registerSchema, loginSchema } from '../validators/auth.schema';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  originGuard,
  authController.refresh
);

router.post(
  '/logout',
  originGuard,
  authController.logout
);

export default router;
