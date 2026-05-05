import { Router } from 'express';
import { authenticate, requireVerified, requireAdmin } from '../middleware/auth.js';
import {
  getTariffs,
  getTariffById,
  createTariff,
  updateTariff,
  deleteTariff,
} from '../controllers/tariffController.js';

const router = Router();

// Public (requires auth + verification)
router.get('/', authenticate, requireVerified, getTariffs);
router.get('/:id', authenticate, requireVerified, getTariffById);

// Admin only
router.post('/', authenticate, requireVerified, requireAdmin, createTariff);
router.patch('/:id', authenticate, requireVerified, requireAdmin, updateTariff);
router.delete('/:id', authenticate, requireVerified, requireAdmin, deleteTariff);

export default router;
