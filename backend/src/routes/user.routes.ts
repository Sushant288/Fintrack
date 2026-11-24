import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateProfileSchema } from '../validators/user.schema';
import { changePasswordSchema, deleteAccountSchema } from '../validators/auth.schema';

const router = Router();

router.use(requireAuth);

router.get('/me', userController.getProfile);

router.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  userController.updateProfile
);

router.post(
  '/me/change-password',
  validate({ body: changePasswordSchema }),
  userController.changePassword
);

router.delete(
  '/me',
  validate({ body: deleteAccountSchema }),
  userController.deleteAccount
);

export default router;
