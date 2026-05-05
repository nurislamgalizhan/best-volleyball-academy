import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import {
  registerSchema,
  loginSchema,
  verifyCodeSchema,
  resendCodeSchema,
} from '../schemas/index.js';
import {
  sendVerificationCode,
  generateVerificationCode,
} from '../services/whatsappService.js';
import {
  clearFailedAttempts,
  getRateLimitState,
  registerFailedAttempt,
} from '../utils/authRateLimit.js';
import { buildUserProfile } from '../utils/userProfile.js';

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function checkResendCooldown(verificationCodeExpires) {
  if (!verificationCodeExpires) return null;
  const sentAt = new Date(verificationCodeExpires.getTime() - 10 * 60 * 1000);
  const secondsLeft = Math.ceil((sentAt.getTime() + 60 * 1000 - Date.now()) / 1000);
  return secondsLeft > 0 ? secondsLeft : null;
}

async function issueCodeToAttempt(attemptId, phone, context) {
  const code = generateVerificationCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  const updated = await prisma.registrationAttempt.update({
    where: { id: attemptId },
    data: { verificationCode: code, verificationCodeExpires: expires },
  });

  try {
    await sendVerificationCode(phone, code);
    return { ok: true, attempt: updated, resendCooldown: 60 };
  } catch (err) {
    console.error(`[${context}] WhatsApp error:`, err.message);
    await prisma.registrationAttempt.update({
      where: { id: attemptId },
      data: { verificationCode: null, verificationCodeExpires: null },
    });
    return { ok: false, error: err };
  }
}

async function issueCodeToUser(userId, phone, context) {
  const code = generateVerificationCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { verificationCode: code, verificationCodeExpires: expires },
  });

  try {
    await sendVerificationCode(phone, code);
    return { ok: true, user: updated, resendCooldown: 60 };
  } catch (err) {
    console.error(`[${context}] WhatsApp error:`, err.message);
    await prisma.user.update({
      where: { id: userId },
      data: { verificationCode: null, verificationCodeExpires: null },
    });
    return { ok: false, user: updated, error: err };
  }
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
// Saves to RegistrationAttempt (NOT User) until phone is verified
export async function register(req, res, next) {
  try {
    const { firstName, lastName, phone, password } = registerSchema.parse(req.body);

    // Verified user with this phone already exists
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser?.isVerified) {
      return res.status(409).json({ message: 'Пользователь с таким номером уже существует' });
    }

    // Cleanup stale expired attempts
    await prisma.registrationAttempt.deleteMany({
      where: {
        phone,
        verificationCodeExpires: { lt: new Date() },
      },
    });

    const passwordHash = await bcrypt.hash(password, 12);

    // Upsert registration attempt (not User table)
    const attempt = await prisma.registrationAttempt.upsert({
      where: { phone },
      update: { passwordHash, firstName, lastName, verificationCode: null, verificationCodeExpires: null },
      create: { phone, passwordHash, firstName, lastName },
    });

    const result = await issueCodeToAttempt(attempt.id, phone, 'Register');
    if (!result.ok) {
      return res.status(502).json({
        message: 'Не удалось отправить код подтверждения в WhatsApp. Попробуйте еще раз.',
      });
    }

    res.status(201).json({
      message: 'Код подтверждения отправлен в WhatsApp.',
      resendCooldown: result.resendCooldown,
    });
  } catch (err) {
    next(err);
  }
}

// ─── VERIFY PHONE ─────────────────────────────────────────────────────────────
// Validates code from RegistrationAttempt, creates User on success
export async function verifyPhone(req, res, next) {
  try {
    const { phone, code } = verifyCodeSchema.parse(req.body);

    const attempt = await prisma.registrationAttempt.findUnique({ where: { phone } });
    if (!attempt) {
      return res.status(404).json({ message: 'Регистрация не найдена или уже завершена' });
    }
    if (!attempt.verificationCode || attempt.verificationCode !== code) {
      return res.status(400).json({ message: 'Неверный код подтверждения' });
    }
    if (!attempt.verificationCodeExpires || attempt.verificationCodeExpires < new Date()) {
      return res.status(400).json({ message: 'Срок действия кода истек. Запросите новый.' });
    }

    // Create verified user + delete attempt atomically
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: attempt.firstName,
          lastName: attempt.lastName,
          phone: attempt.phone,
          passwordHash: attempt.passwordHash,
          isVerified: true,
        },
      });
      await tx.registrationAttempt.delete({ where: { id: attempt.id } });
      return created;
    });

    const token = signToken(user);
    const profile = await buildUserProfile(user);
    res.json({ message: 'Аккаунт успешно подтвержден', token, user: profile });
  } catch (err) {
    next(err);
  }
}

// ─── RESEND CODE ──────────────────────────────────────────────────────────────
// Works for RegistrationAttempt (new registration flow)
export async function resendCode(req, res, next) {
  try {
    const { phone } = resendCodeSchema.parse(req.body);

    const attempt = await prisma.registrationAttempt.findUnique({ where: { phone } });
    if (!attempt) {
      return res.status(404).json({ message: 'Регистрация не найдена' });
    }

    const secondsLeft = checkResendCooldown(attempt.verificationCodeExpires);
    if (secondsLeft) {
      return res.status(429).json({ message: `Подождите ${secondsLeft} сек. перед повторной отправкой` });
    }

    const result = await issueCodeToAttempt(attempt.id, phone, 'ResendCode');
    if (!result.ok) {
      return res.status(502).json({
        message: 'Не удалось отправить код в WhatsApp. Попробуйте еще раз.',
      });
    }

    res.json({ message: 'Новый код отправлен в WhatsApp' });
  } catch (err) {
    next(err);
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const rateLimitState = getRateLimitState(req.ip, phone);

    if (rateLimitState.blocked) {
      return res.status(429).json({
        message: `Слишком много попыток входа. Повторите через ${rateLimitState.retryAfterSeconds} сек.`,
      });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive) {
      registerFailedAttempt(req.ip, phone);
      return res.status(401).json({ message: 'Неверный номер телефона или пароль' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      registerFailedAttempt(req.ip, phone);
      return res.status(401).json({ message: 'Неверный номер телефона или пароль' });
    }

    clearFailedAttempts(req.ip, phone);

    // ── Admin 2FA: always require WhatsApp code ──────────────────────────────
    if (user.role === 'ADMIN') {
      const secondsLeft = checkResendCooldown(user.verificationCodeExpires);
      let resendCooldown = secondsLeft ?? 0;
      let deliveryFailed = false;
      let message = '';

      if (secondsLeft) {
        message = `Код уже отправлен. Повторите через ${secondsLeft} сек.`;
      } else {
        const result = await issueCodeToUser(user.id, phone, 'AdminLogin');
        deliveryFailed = !result.ok;
        resendCooldown = result.ok ? result.resendCooldown : 0;
        message = result.ok
          ? 'Код подтверждения отправлен в WhatsApp.'
          : 'Не удалось отправить код в WhatsApp. Нажмите "Отправить повторно".';
      }

      return res.json({
        requiresAdminMfa: true,
        phone: user.phone,
        resendCooldown,
        deliveryFailed,
        message,
      });
    }

    // ── Regular visitor ─────────────────────────────────────────────────────
    const token = signToken(user);
    const profile = await buildUserProfile(user);
    res.json({ token, user: profile });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN MFA VERIFY ─────────────────────────────────────────────────────────
// Second step of admin login: validate WhatsApp code → return token
export async function adminMfaVerify(req, res, next) {
  try {
    const { phone, code } = verifyCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive || user.role !== 'ADMIN') {
      return res.status(404).json({ message: 'Администратор не найден' });
    }

    if (!user.verificationCode || user.verificationCode !== code) {
      return res.status(400).json({ message: 'Неверный код подтверждения' });
    }
    if (!user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ message: 'Срок действия кода истек. Запросите новый.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode: null, verificationCodeExpires: null },
    });

    const token = signToken(user);
    const profile = await buildUserProfile(user);
    res.json({ token, user: profile });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN MFA RESEND ─────────────────────────────────────────────────────────
export async function adminMfaResend(req, res, next) {
  try {
    const { phone } = resendCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive || user.role !== 'ADMIN') {
      return res.status(404).json({ message: 'Администратор не найден' });
    }

    const secondsLeft = checkResendCooldown(user.verificationCodeExpires);
    if (secondsLeft) {
      return res.status(429).json({ message: `Подождите ${secondsLeft} сек. перед повторной отправкой` });
    }

    const result = await issueCodeToUser(user.id, phone, 'AdminMfaResend');
    if (!result.ok) {
      return res.status(502).json({ message: 'Не удалось отправить код в WhatsApp.' });
    }

    res.json({ message: 'Новый код отправлен' });
  } catch (err) {
    next(err);
  }
}

// ─── GET ME ───────────────────────────────────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    const profile = await buildUserProfile(user);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { phone } = resendCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive) {
      return res.json({ message: 'Если номер зарегистрирован, код отправлен в WhatsApp.' });
    }

    const secondsLeft = checkResendCooldown(user.verificationCodeExpires);
    if (secondsLeft) {
      return res.status(429).json({ message: `Подождите ${secondsLeft} сек. перед повторной отправкой` });
    }

    const result = await issueCodeToUser(user.id, phone, 'ForgotPassword');
    if (!result.ok) {
      return res.status(502).json({
        message: 'Не удалось отправить код в WhatsApp. Попробуйте еще раз.',
      });
    }

    res.json({ message: 'Если номер зарегистрирован, код отправлен в WhatsApp.' });
  } catch (err) {
    next(err);
  }
}

// ─── CHANGE PASSWORD (authenticated) ─────────────────────────────────────────
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Заполните все поля' });
    }
    if (newPassword.length < 6 || newPassword.length > 200) {
      return res.status(400).json({ message: 'Пароль должен быть от 6 до 200 символов' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ message: 'Текущий пароль указан неверно' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ message: 'Пароль успешно изменен' });
  } catch (err) {
    next(err);
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
export async function resetPassword(req, res, next) {
  try {
    const { phone, code, newPassword } = req.body;

    if (!phone || !code || !newPassword) {
      return res.status(400).json({ message: 'Заполните все поля' });
    }
    if (newPassword.length < 6 || newPassword.length > 200) {
      return res.status(400).json({ message: 'Пароль должен быть от 6 до 200 символов' });
    }

    const normalizedPhone = resendCodeSchema.parse({ phone }).phone;
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    if (!user.verificationCode || user.verificationCode !== code) {
      return res.status(400).json({ message: 'Неверный код подтверждения' });
    }
    if (!user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ message: 'Срок действия кода истек. Запросите новый.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, verificationCode: null, verificationCodeExpires: null },
    });

    clearFailedAttempts(req.ip, normalizedPhone);
    res.json({ message: 'Пароль успешно изменен. Войдите с новым паролем.' });
  } catch (err) {
    next(err);
  }
}
