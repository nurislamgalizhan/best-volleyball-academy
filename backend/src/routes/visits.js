import { Router } from 'express';
import { authenticate, requireVerified, requireAdmin } from '../middleware/auth.js';
import { checkIn, getMyVisitLogs, getVisitLogs, adminCheckIn } from '../controllers/visitController.js';

const router = Router();

// Visitor: check in
router.post('/checkin', authenticate, requireVerified, checkIn);
router.get('/my', authenticate, requireVerified, getMyVisitLogs);

// Admin: view logs + manual check-in
router.get('/', authenticate, requireVerified, requireAdmin, getVisitLogs);
router.post('/admin-checkin', authenticate, requireVerified, requireAdmin, adminCheckIn);

export default router;
