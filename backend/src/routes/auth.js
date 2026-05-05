import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  register,
  verifyPhone,
  resendCode,
  login,
  adminMfaVerify,
  adminMfaResend,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/verify', verifyPhone);
router.post('/resend-code', resendCode);
router.post('/login', login);

// Admin 2FA: second step after password validation
router.post('/admin-mfa/verify', adminMfaVerify);
router.post('/admin-mfa/resend', adminMfaResend);

router.get('/me', authenticate, getMe);
router.patch('/me/password', authenticate, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
