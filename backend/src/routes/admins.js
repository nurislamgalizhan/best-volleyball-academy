import { Router } from 'express';
import { authenticate, requireVerified, requireSuperAdmin } from '../middleware/auth.js';
import {
  createAdmin,
  demoteAdmin,
  getAdmins,
  promoteAdmin,
  resetAdminPassword,
} from '../controllers/adminController.js';

const router = Router();

router.use(authenticate, requireVerified, requireSuperAdmin);
router.get('/', getAdmins);
router.post('/', createAdmin);
router.post('/:id/promote', promoteAdmin);
router.post('/:id/password', resetAdminPassword);
router.post('/:id/demote', demoteAdmin);

export default router;
