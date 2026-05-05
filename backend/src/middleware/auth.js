import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Токен не предоставлен' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ message: 'Недействительный токен' });
  }
}

export function requireVerified(req, res, next) {
  // Will be set by authenticate, then we check DB
  prisma.user
    .findUnique({ where: { id: req.userId }, select: { isVerified: true, isActive: true } })
    .then((user) => {
      if (!user || !user.isActive) {
        return res.status(403).json({ message: 'Аккаунт не найден или деактивирован' });
      }
      if (!user.isVerified) {
        return res.status(403).json({ message: 'Аккаунт не верифицирован через WhatsApp' });
      }
      next();
    })
    .catch(next);
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ message: 'Недостаточно прав' });
  }
  next();
}
