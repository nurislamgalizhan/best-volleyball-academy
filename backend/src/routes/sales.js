import { Router } from 'express';
import { authenticate, requireVerified, requireAdmin } from '../middleware/auth.js';
import { sellTariff, getSaleLogs } from '../controllers/saleController.js';

const router = Router();

// No DELETE route — SaleLogs are immutable
router.post('/', authenticate, requireVerified, requireAdmin, sellTariff);
router.get('/', authenticate, requireVerified, requireAdmin, getSaleLogs);

export default router;
