import { Router } from 'express';
import { authenticate, requireVerified, requireStaff, requireSuperAdmin } from '../middleware/auth.js';
import { getMySaleLogs, getSaleLogs, refundSale, sellTariff, updateSale } from '../controllers/saleController.js';

const router = Router();

router.get('/my', authenticate, requireVerified, getMySaleLogs);
router.post('/', authenticate, requireVerified, requireStaff, sellTariff);
router.get('/', authenticate, requireVerified, requireSuperAdmin, getSaleLogs);
router.patch('/:id', authenticate, requireVerified, requireStaff, updateSale);
router.post('/:id/refund', authenticate, requireVerified, requireStaff, refundSale);

export default router;
