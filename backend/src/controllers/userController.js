import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { usersQuerySchema, adjustUserSchema, createUserSchema, logsQuerySchema, freezeSchema } from '../schemas/index.js';
import { createAdminAction } from '../utils/adminActions.js';

function userPublic(user) {
  const { passwordHash, verificationCode, verificationCodeExpires, ...rest } = user;
  return rest;
}

export async function getUsers(req, res, next) {
  try {
    const { page, limit, search } = usersQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      role: 'VISITOR',
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          visitsBalance: true,
          subscriptionEnd: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        visitLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        saleLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { tariff: { select: { name: true, visitsAmount: true } } },
        },
      },
    });

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const lastSale = user.saleLogs[0];
    const isUnlimitedSubscription =
      lastSale?.tariff?.visitsAmount === null &&
      user.subscriptionEnd &&
      user.subscriptionEnd > new Date();

    res.json({ ...userPublic(user), isUnlimitedSubscription: !!isUnlimitedSubscription });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { firstName, lastName, phone, password, role } = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ message: 'Пользователь с таким номером уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { firstName, lastName, phone, passwordHash, role: role || 'VISITOR', isVerified: true },
      });

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: createdUser.id,
        action: 'USER_CREATED',
        details: {
          firstName: createdUser.firstName,
          lastName: createdUser.lastName,
          phone: createdUser.phone,
          role: createdUser.role,
        },
      });

      return createdUser;
    });

    res.status(201).json(userPublic(user));
  } catch (err) {
    next(err);
  }
}

export async function adjustUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = adjustUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!user.subscriptionEnd) {
      return res.status(400).json({ message: 'У клиента нет абонемента — корректировка недоступна' });
    }

    const lastSale = await prisma.saleLog.findFirst({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { tariff: true },
    });

    if (lastSale?.tariff?.visitsAmount === null) {
      return res.status(400).json({ message: 'У клиента безлимитный абонемент — корректировка посещений недоступна' });
    }

    if (data.visitsBalance !== undefined && lastSale?.tariff?.visitsAmount != null) {
      if (data.visitsBalance > lastSale.tariff.visitsAmount) {
        return res.status(400).json({
          message: `Нельзя установить больше ${lastSale.tariff.visitsAmount} посещений (лимит тарифа)`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id },
        data: {
          ...(data.visitsBalance !== undefined && { visitsBalance: data.visitsBalance }),
        },
      });

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'VISITS_BALANCE_UPDATED',
        details: {
          previousVisitsBalance: user.visitsBalance,
          nextVisitsBalance: nextUser.visitsBalance,
        },
      });

      return nextUser;
    });

    res.json(userPublic(updated));
  } catch (err) {
    next(err);
  }
}

export async function deactivateUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (user.role === 'ADMIN') return res.status(403).json({ message: 'Нельзя деактивировать администратора' });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'USER_DEACTIVATED',
        details: {
          phone: user.phone,
          fullName: `${user.firstName} ${user.lastName}`,
        },
      });
    });

    res.json({ message: 'Пользователь деактивирован' });
  } catch (err) {
    next(err);
  }
}

export async function freezeSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = req.userRole === 'ADMIN';

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!isAdmin && req.userId !== id) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    if (!user.subscriptionEnd || user.subscriptionEnd < new Date()) {
      return res.status(400).json({ message: 'Нет активного абонемента для заморозки' });
    }

    if (user.frozenUntil && user.frozenUntil > new Date()) {
      return res.status(400).json({ message: 'Абонемент уже заморожен' });
    }

    const lastSale = await prisma.saleLog.findFirst({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { tariff: true },
    });

    if (lastSale?.tariff?.visitsAmount === 1) {
      return res.status(400).json({ message: 'Разовое посещение нельзя заморозить' });
    }

    const { freezeFrom, freezeTo } = freezeSchema.parse(req.body);
    const freezeFromDate = new Date(freezeFrom);
    const freezeToDate = new Date(freezeTo);
    const freezeDays = Math.ceil((freezeToDate - freezeFromDate) / (24 * 60 * 60 * 1000));

    if (freezeToDate > user.subscriptionEnd) {
      return res.status(400).json({ message: 'Период заморозки выходит за рамки абонемента' });
    }

    const newSubscriptionEnd = new Date(user.subscriptionEnd.getTime() + freezeDays * 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { frozenUntil: freezeToDate, subscriptionEnd: newSubscriptionEnd },
      });

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'SUBSCRIPTION_FROZEN',
        details: { freezeFrom: freezeFromDate.toISOString(), frozenUntil: freezeToDate.toISOString(), daysAdded: freezeDays },
      });

      return u;
    });

    res.json({ message: `Абонемент заморожен на ${freezeDays} дн.`, frozenUntil: updated.frozenUntil });
  } catch (err) {
    next(err);
  }
}

export async function unfreezeSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = req.userRole === 'ADMIN';

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!isAdmin && req.userId !== id) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    if (!user.frozenUntil || user.frozenUntil <= new Date()) {
      return res.status(400).json({ message: 'Абонемент не заморожен' });
    }

    const now = new Date();
    const remainingFreezeDays = Math.ceil((user.frozenUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const newSubscriptionEnd = new Date(user.subscriptionEnd.getTime() - remainingFreezeDays * 24 * 60 * 60 * 1000);

    const updated = await prisma.user.update({
      where: { id },
      data: { frozenUntil: null, subscriptionEnd: newSubscriptionEnd },
    });

    res.json({ message: 'Абонемент разморожен', subscriptionEnd: updated.subscriptionEnd });
  } catch (err) {
    next(err);
  }
}

export async function getAdminActionLogs(req, res, next) {
  try {
    const { page, limit, from, to, userId } = logsQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      ...(userId && { targetUserId: userId }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.adminActionLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, phone: true } },
          targetUser: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      prisma.adminActionLog.count({ where }),
    ]);

    res.json({
      data: logs,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}
