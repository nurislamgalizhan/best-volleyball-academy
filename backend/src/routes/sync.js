import { Router } from 'express';
import { authenticate, requireVerified, requireStaff } from '../middleware/auth.js';
import { syncStatus } from '../controllers/syncController.js';

const router = Router();
router.get('/status', authenticate, requireVerified, requireStaff, syncStatus);
export default router;
