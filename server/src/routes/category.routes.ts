// M1: Category routes
import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { categorySchema } from '../validators/category.schema';

const router = Router();

router.use(authenticate);
router.get('/', categoryController.getCategories);
router.post('/', validate(categorySchema), categoryController.createCategory);
router.put('/:id', validate(categorySchema), categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

export default router;
