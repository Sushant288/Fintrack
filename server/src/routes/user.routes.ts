// M0: User profile routes
import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);

export default router;
