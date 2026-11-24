import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryListQuerySchema,
  categoryDeleteQuerySchema
} from '../validators/category.schema';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: categoryListQuerySchema }),
  categoryController.listCategories
);

router.post(
  '/',
  validate({ body: createCategorySchema }),
  categoryController.createCategory
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCategorySchema }),
  categoryController.updateCategory
);

router.delete(
  '/:id',
  validate({ params: idParamSchema, query: categoryDeleteQuerySchema }),
  categoryController.deleteCategory
);

export default router;
