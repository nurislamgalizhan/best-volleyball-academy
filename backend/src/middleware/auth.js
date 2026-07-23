import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { isStaffRole, isSuperAdminRole } from '../utils/roles.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Токен не предоставлен' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isVerified: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Аккаунт не найден или деактивирован' });
    }
    req.userId = payload.userId;
    req.userRole = user.role;
    req.authUser = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Недействительный токен' });
  }
}

export function requireVerified(req, res, next) {
  if (!req.authUser?.isVerified) {
    return res.status(403).json({ message: 'Аккаунт не верифицирован через WhatsApp' });
  }
  next();
}

export function requireStaff(req, res, next) {
  if (!isStaffRole(req.userRole)) {
    return res.status(403).json({ message: 'Недостаточно прав' });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdminRole(req.userRole)) {
    return res.status(403).json({ message: 'Доступно только главному администратору' });
  }
  next();
}

export const requireAdmin = requireStaff;
