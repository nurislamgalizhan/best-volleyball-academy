import { prisma } from '../db.js';
import { adminPasswordSchema, createAdminSchema } from '../schemas/index.js';
import { createAdminAction } from '../utils/adminActions.js';
import { hashPassword } from '../utils/password.js';

function publicAdmin(user) {
  const { passwordHash, verificationCode, verificationCodeExpires, ...rest } = user;
  return rest;
}

export async function getAdmins(req, res, next) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
      },
    });
    res.json({ data: admins });
  } catch (err) {
    next(err);
  }
}

export async function createAdmin(req, res, next) {
  try {
    const data = createAdminSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) {
      return res.status(409).json({
        message: 'Пользователь с таким номером уже существует. Используйте назначение существующего пользователя.',
      });
    }

    const passwordHash = await hashPassword(data.password);
    const admin = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          passwordHash,
          role: 'ADMIN',
          isVerified: true,
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: created.id,
        action: 'ADMIN_PROMOTED',
        details: { createdAsAdmin: true },
      });
      return created;
    });

    res.status(201).json(publicAdmin(admin));
  } catch (err) {
    next(err);
  }
}

export async function promoteAdmin(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный пользователь' });
    }
    const { password } = adminPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    if (user.role !== 'VISITOR') {
      return res.status(400).json({ message: 'Пользователь уже имеет административную роль' });
    }
    if (user._count.subscriptions > 0) {
      return res.status(400).json({ message: 'Нельзя назначить администратором клиента с абонементами' });
    }

    const passwordHash = await hashPassword(password);
    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id },
        data: {
          role: 'ADMIN',
          passwordHash,
          isVerified: true,
          verificationCode: null,
          verificationCodeExpires: null,
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'ADMIN_PROMOTED',
        details: { createdAsAdmin: false },
      });
      return nextUser;
    });

    res.json(publicAdmin(updated));
  } catch (err) {
    next(err);
  }
}

export async function resetAdminPassword(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный пользователь' });
    }
    if (id === req.userId) {
      return res.status(400).json({ message: 'Используйте смену пароля в настройках своего аккаунта' });
    }

    const { password } = adminPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Администратор не найден' });
    }
    if (user.role !== 'ADMIN') {
      return res.status(400).json({ message: 'Пароль можно назначить только обычному администратору' });
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          verificationCode: null,
          verificationCodeExpires: null,
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'ADMIN_PASSWORD_RESET',
      });
    });

    res.json({ message: 'Пароль администратора изменён' });
  } catch (err) {
    next(err);
  }
}

export async function demoteAdmin(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный пользователь' });
    }
    if (id === req.userId) {
      return res.status(400).json({ message: 'Нельзя снять административные права у самого себя' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Нельзя изменить роль главного администратора' });
    }
    if (user.role !== 'ADMIN') {
      return res.status(400).json({ message: 'Пользователь не является администратором' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({ where: { id }, data: { role: 'VISITOR' } });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'ADMIN_DEMOTED',
      });
      return nextUser;
    });

    res.json(publicAdmin(updated));
  } catch (err) {
    next(err);
  }
}
