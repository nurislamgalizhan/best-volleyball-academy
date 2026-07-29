import { Router } from 'express';
import { authenticate, requireStaff, requireVerified } from '../middleware/auth.js';
import {
  deleteVerificationRequest,
  getVerificationRequests,
  verifyClientRequest,
} from '../controllers/verificationRequestController.js';

const router = Router();

router.use(authenticate, requireVerified, requireStaff);
router.get('/', getVerificationRequests);
router.post('/:id/verify', verifyClientRequest);
router.delete('/:id', deleteVerificationRequest);

export default router;
