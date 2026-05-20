import { Router } from 'express';
import { authenticate, requireVerified, requireAdmin } from '../middleware/auth.js';
import {
  createSection,
  deleteSection,
  getSections,
  updateSection,
} from '../controllers/sectionController.js';

const router = Router();

router.get('/', authenticate, requireVerified, getSections);
router.post('/', authenticate, requireVerified, requireAdmin, createSection);
router.patch('/:id', authenticate, requireVerified, requireAdmin, updateSection);
router.delete('/:id', authenticate, requireVerified, requireAdmin, deleteSection);

export default router;
