import { Router } from 'express';
import { authenticate, requireVerified, requireStaff, requireSuperAdmin } from '../middleware/auth.js';
import {
  getUsers,
  getUserById,
  createUser,
  adjustUser,
  deactivateUser,
  cancelSubscription,
  activateSubscription,
  getAdminActionLogs,
  freezeSubscription,
  unfreezeSubscription,
} from '../controllers/userController.js';

const router = Router();

// Freeze/unfreeze: visitor can manage their own, admin can manage any
router.post('/:id/freeze', authenticate, requireVerified, freezeSubscription);
router.post('/:id/unfreeze', authenticate, requireVerified, unfreezeSubscription);

router.use(authenticate, requireVerified, requireStaff);

router.get('/', getUsers);
router.get('/admin-history', requireSuperAdmin, getAdminActionLogs);
router.post('/', createUser);
router.get('/:id', getUserById);
router.patch('/:id/adjust', adjustUser);
router.post('/:id/subscriptions/:subscriptionId/cancel', cancelSubscription);
router.post('/:id/subscriptions/:subscriptionId/activate', activateSubscription);
router.delete('/:id', deactivateUser);

export default router;
