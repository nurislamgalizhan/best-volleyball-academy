import { prisma } from '../db.js';
import {
  usersQuerySchema,
  adjustUserSchema,
  createUserSchema,
  logsQuerySchema,
  freezeSchema,
  cancelSubscriptionSchema,
  activateSubscriptionSchema,
  clientNoteSchema,
  deleteUserSchema,
} from '../schemas/index.js';
import { createAdminAction } from '../utils/adminActions.js';
import { hashPassword } from '../utils/password.js';
import { clearExpiredVisits, clearExpiredVisitsForUsers } from '../utils/subscription.js';
import {
  clearedFreezeData,
  completeFreezePlan,
  createFreezePlan,
  freezePublicState,
  getFreezeDaysRemaining,
} from '../utils/freeze.js';
import { isStaffRole } from '../utils/roles.js';
import { commandSharedSubscription, createIdempotencyKey } from '../services/syncClient.js';
import { applySharedSubscriptionState } from '../services/sharedOperations.js';
import { generateTemporaryPassword } from '../utils/registrationSecurity.js';
import { clearFailedAttemptsForIdentifier } from '../utils/authRateLimit.js';

function userPublic(user) {
  const {
    passwordHash,
    verificationCode,
    verificationCodeExpires,
    tokenVersion,
    registrationStatusTokenHash,
    ...rest
  } = user;
  return rest;
}

function subscriptionPublic(subscription) {
  return {
    ...subscription,
    ...freezePublicState(subscription),
    isShared: Boolean(subscription.syncId),
    sourceSite: subscription.originSite,
  };
}

async function getSubscriptionForAction(userId, userSubscriptionId) {
  await clearExpiredVisitsForUsers(prisma);

  const subscriptions = await prisma.userSubscription.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      ...(userSubscriptionId && { id: userSubscriptionId }),
    },
    include: { section: true, tariff: true },
    orderBy: [{ section: { sortOrder: 'asc' } }, { createdAt: 'desc' }],
  });

  if (userSubscriptionId && subscriptions.length === 0) {
    return { error: { status: 404, message: 'Абонемент не найден' } };
  }
  if (!userSubscriptionId && subscriptions.length > 1) {
    return { error: { status: 400, message: 'Выберите секцию/абонемент для операции' } };
  }
  if (subscriptions.length === 0) {
    return { error: { status: 400, message: 'У клиента нет активного абонемента' } };
  }

  return { subscription: subscriptions[0] };
}

export async function getUsers(req, res, next) {
  try {
    const { page, limit, search, sectionId } = usersQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    await clearExpiredVisitsForUsers(prisma);

    const where = {
      isActive: true,
      role: 'VISITOR',
      ...(sectionId && {
        OR: [
          { sectionMemberships: { some: { sectionId } } },
          { subscriptions: { some: { sectionId, status: 'ACTIVE' } } },
        ],
      }),
      ...(search && {
        AND: [
          {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
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
          subscriptions: {
            where: { status: 'ACTIVE' },
            include: {
              section: { select: { id: true, name: true } },
              tariff: { select: { id: true, name: true, visitsAmount: true } },
            },
            orderBy: [{ section: { sortOrder: 'asc' } }, { createdAt: 'desc' }],
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      data: users.map((user) => ({
        ...user,
        subscriptions: user.subscriptions.map(subscriptionPublic),
      })),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    await clearExpiredVisitsForUsers(prisma);

    const foundUser = await prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          include: {
            section: true,
            tariff: true,
            saleLog: true,
            visitLogs: { orderBy: { createdAt: 'desc' }, take: 3 },
          },
        },
        visitLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { section: { select: { id: true, name: true } } },
        },
        saleLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            section: { select: { id: true, name: true } },
            tariff: { select: { name: true, visitsAmount: true } },
            subscription: { select: { id: true, visitsBalance: true, subscriptionEnd: true, status: true } },
          },
        },
        clientNotes: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { clientNotes: true } },
      },
    });

    let user = foundUser;

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user = await clearExpiredVisits(prisma, user);

    const subscriptions = user.subscriptions.map(subscriptionPublic);
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'ACTIVE');
    const isUnlimitedSubscription = activeSubscriptions.some((subscription) => subscription.tariff?.visitsAmount === null);

    const publicUser = userPublic(user);
    const { clientNotes, _count, ...userData } = publicUser;

    res.json({
      ...userData,
      subscriptions,
      visitLogs: user.visitLogs.map((visit) => ({
        ...visit,
        isShared: Boolean(visit.syncId),
      })),
      activeSubscriptions,
      isUnlimitedSubscription: !!isUnlimitedSubscription,
      latestNote: clientNotes[0] || null,
      notesCount: _count.clientNotes,
    });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { firstName, lastName, phone, password } = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ message: 'Пользователь с таким номером уже существует' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { firstName, lastName, phone, passwordHash, role: 'VISITOR', isVerified: true },
      });

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: createdUser.id,
        action: 'USER_CREATED',
        details: {
          firstName: createdUser.firstName,
          lastName: createdUser.lastName,
          phone: createdUser.phone,
          role: 'VISITOR',
        },
      });

      return createdUser;
    });

    res.status(201).json(userPublic(user));
  } catch (err) {
    next(err);
  }
}

export async function resetClientPassword(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный клиент' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Клиент не найден' });
    }
    if (user.role !== 'VISITOR') {
      return res.status(403).json({ message: 'Здесь можно сбросить пароль только клиента' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          tokenVersion: { increment: 1 },
          verificationCode: null,
          verificationCodeExpires: null,
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'CLIENT_PASSWORD_RESET',
        details: {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
        },
      });
    });
    clearFailedAttemptsForIdentifier(user.phone);

    res.json({
      message: 'Временный пароль создан',
      temporaryPassword,
    });
  } catch (err) {
    next(err);
  }
}

export async function adjustUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = adjustUserSchema.parse(req.body);

    const foundUser = await prisma.user.findUnique({ where: { id } });
    let user = foundUser;
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user = await clearExpiredVisits(prisma, user);

    const selected = await getSubscriptionForAction(id, data.userSubscriptionId);
    if (selected.error) {
      return res.status(selected.error.status).json({ message: selected.error.message });
    }
    const subscription = selected.subscription;

    if (subscription.tariff?.visitsAmount === null) {
      return res.status(400).json({ message: 'У клиента безлимитный абонемент — корректировка посещений недоступна' });
    }

    if (data.visitsBalance !== undefined && subscription.tariff?.visitsAmount != null) {
      if (data.visitsBalance > subscription.tariff.visitsAmount) {
        return res.status(400).json({
          message: `Нельзя установить больше ${subscription.tariff.visitsAmount} посещений (лимит тарифа)`,
        });
      }
    }

    const sharedState = subscription.syncId
      ? await commandSharedSubscription(subscription.syncId, {
          type: 'ADJUST',
          visitsBalance: data.visitsBalance,
          actorLabel: `BVA администратор #${req.userId}`,
          idempotencyKey: createIdempotencyKey(`adjust:${subscription.syncId}`),
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const nextSubscription = sharedState
        ? await applySharedSubscriptionState(tx, subscription, sharedState)
        : await tx.userSubscription.update({
            where: { id: subscription.id },
            data: {
              ...(data.visitsBalance !== undefined && { visitsBalance: data.visitsBalance }),
              ...(data.visitsBalance === 0 && { status: 'EXPIRED', frozenUntil: null }),
            },
            include: { section: true, tariff: true },
          });

      if (data.visitsBalance === 0) {
        await tx.user.update({
          where: { id },
          data: { visitsBalance: 0, frozenUntil: null },
        });
      }

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'VISITS_BALANCE_UPDATED',
        details: {
          sectionName: subscription.section.name,
          previousVisitsBalance: subscription.visitsBalance,
          nextVisitsBalance: nextSubscription.visitsBalance,
        },
      });

      return nextSubscription;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getClientNotes(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { page, limit } = logsQuerySchema.parse(req.query);
    const user = await prisma.user.findFirst({ where: { id, isActive: true, role: 'VISITOR' } });
    if (!user) return res.status(404).json({ message: 'Клиент не найден' });

    const where = { userId: id };
    const [notes, total] = await Promise.all([
      prisma.clientNote.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.clientNote.count({ where }),
    ]);

    res.json({
      data: notes,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function createClientNote(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { content } = clientNoteSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: { id, isActive: true, role: 'VISITOR' } });
    if (!user) return res.status(404).json({ message: 'Клиент не найден' });

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.clientNote.create({
        data: { userId: id, authorId: req.userId, content },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'CLIENT_NOTE_CREATED',
        details: { noteId: created.id },
      });
      return created;
    });

    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
}

export async function updateClientNote(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const noteId = parseInt(req.params.noteId, 10);
    const { content } = clientNoteSchema.parse(req.body);
    const existing = await prisma.clientNote.findFirst({ where: { id: noteId, userId: id } });
    if (!existing) return res.status(404).json({ message: 'Заметка не найдена' });

    const note = await prisma.$transaction(async (tx) => {
      const updated = await tx.clientNote.update({
        where: { id: noteId },
        data: { content },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'CLIENT_NOTE_UPDATED',
        details: { noteId },
      });
      return updated;
    });

    res.json(note);
  } catch (err) {
    next(err);
  }
}

export async function deleteClientNote(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const noteId = parseInt(req.params.noteId, 10);
    const existing = await prisma.clientNote.findFirst({ where: { id: noteId, userId: id } });
    if (!existing) return res.status(404).json({ message: 'Заметка не найдена' });

    await prisma.$transaction(async (tx) => {
      await tx.clientNote.delete({ where: { id: noteId } });
      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'CLIENT_NOTE_DELETED',
        details: { noteId },
      });
    });

    res.json({ message: 'Заметка удалена' });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    deleteUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { syncId: { not: null } },
          select: { id: true },
          take: 1,
        },
        visitLogs: {
          where: { syncId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) return res.status(404).json({ message: 'Клиент не найден' });
    if (isStaffRole(user.role)) {
      return res.status(403).json({ message: 'Администраторов можно удалять только через управление ролями' });
    }
    if (user.syncMemberId || user.subscriptions.length || user.visitLogs.length) {
      return res.status(409).json({
        code: 'SYNCED_CLIENT_DELETE_BLOCKED',
        message: 'Клиент связан с mmedet.kz и не может быть удален только из BVA. Сначала нужно безопасно отключить его от общей синхронизации.',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const visits = await tx.visitLog.deleteMany({ where: { userId: id } });
      const subscriptions = await tx.userSubscription.deleteMany({ where: { userId: id } });
      const sales = await tx.saleLog.deleteMany({ where: { userId: id } });
      const memberships = await tx.sectionMembership.deleteMany({ where: { userId: id } });
      const notes = await tx.clientNote.deleteMany({ where: { userId: id } });
      await tx.adminActionLog.deleteMany({
        where: {
          OR: [
            { targetUserId: id },
            { adminId: id },
          ],
        },
      });
      await tx.registrationAttempt.deleteMany({ where: { phone: user.phone } });
      await tx.user.delete({ where: { id } });
      await createAdminAction(tx, {
        adminId: req.userId,
        action: 'USER_DELETED',
      });
      return {
        visits: visits.count,
        subscriptions: subscriptions.count,
        sales: sales.count,
        memberships: memberships.count,
        notes: notes.count,
      };
    });

    res.json({ message: 'Клиент и все связанные данные удалены', deleted: result });
  } catch (err) {
    next(err);
  }
}

export async function cancelSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    cancelSubscriptionSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const subscription = await prisma.userSubscription.findFirst({
      where: { id: subscriptionId, userId: id },
      include: { section: true, tariff: true },
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Абонемент не найден' });
    }
    if (subscription.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Можно деактивировать только активный абонемент' });
    }

    const sharedState = subscription.syncId
      ? await commandSharedSubscription(subscription.syncId, {
          type: 'CANCEL',
          actorLabel: `BVA администратор #${req.userId}`,
          idempotencyKey: createIdempotencyKey(`cancel:${subscription.syncId}`),
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const nextSubscription = sharedState
        ? await applySharedSubscriptionState(tx, subscription, sharedState)
        : await tx.userSubscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELLED', visitsBalance: 0, frozenUntil: null },
            include: { section: true, tariff: true },
          });

      const otherActiveCount = await tx.userSubscription.count({
        where: {
          userId: id,
          status: 'ACTIVE',
          NOT: { id: subscription.id },
        },
      });

      if (otherActiveCount === 0) {
        await tx.user.update({
          where: { id },
          data: { visitsBalance: 0, subscriptionEnd: null, frozenUntil: null },
        });
      }

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'SUBSCRIPTION_CANCELLED',
        details: {
          subscriptionId: subscription.id,
          sectionName: subscription.section.name,
          tariffName: subscription.tariff.name,
          previousVisitsBalance: subscription.visitsBalance,
          subscriptionEnd: subscription.subscriptionEnd.toISOString(),
        },
      });

      return nextSubscription;
    });

    res.json({ message: 'Абонемент деактивирован', subscription: updated });
  } catch (err) {
    next(err);
  }
}

export async function activateSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    const data = activateSubscriptionSchema.parse(req.body);

    await clearExpiredVisitsForUsers(prisma);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const subscription = await prisma.userSubscription.findFirst({
      where: { id: subscriptionId, userId: id },
      include: { section: true, tariff: true },
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Абонемент не найден' });
    }
    if (subscription.status === 'ACTIVE') {
      return res.status(400).json({ message: 'Абонемент уже активен' });
    }
    if (subscription.status === 'REFUNDED') {
      return res.status(400).json({ message: 'Нельзя активировать возвращенный абонемент' });
    }
    if (subscription.subscriptionEnd <= new Date()) {
      return res.status(400).json({ message: 'Нельзя активировать абонемент с истекшим сроком действия' });
    }

    const conflictingSubscription = await prisma.userSubscription.findFirst({
      where: {
        userId: id,
        sectionId: subscription.sectionId,
        status: 'ACTIVE',
        NOT: { id: subscription.id },
      },
    });
    if (conflictingSubscription) {
      return res.status(400).json({ message: 'В этой секции уже есть активный абонемент' });
    }

    const isUnlimited = subscription.tariff?.visitsAmount === null;
    const nextVisitsBalance = isUnlimited ? 0 : (data.visitsBalance ?? Math.max(1, subscription.visitsBalance || 1));
    if (!isUnlimited) {
      if (nextVisitsBalance < 1) {
        return res.status(400).json({ message: 'Для активации укажите минимум 1 посещение' });
      }
      if (nextVisitsBalance > subscription.tariff.visitsAmount) {
        return res.status(400).json({
          message: `Нельзя установить больше ${subscription.tariff.visitsAmount} посещений (лимит тарифа)`,
        });
      }
    }

    const sharedState = subscription.syncId
      ? await commandSharedSubscription(subscription.syncId, {
          type: 'ACTIVATE',
          visitsBalance: nextVisitsBalance,
          actorLabel: `BVA администратор #${req.userId}`,
          idempotencyKey: createIdempotencyKey(`activate:${subscription.syncId}`),
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const nextSubscription = sharedState
        ? await applySharedSubscriptionState(tx, subscription, sharedState)
        : await tx.userSubscription.update({
            where: { id: subscription.id },
            data: {
              status: 'ACTIVE',
              visitsBalance: nextVisitsBalance,
              frozenUntil: null,
            },
            include: { section: true, tariff: true },
          });

      await tx.user.update({
        where: { id },
        data: {
          visitsBalance: nextVisitsBalance,
          subscriptionEnd: subscription.subscriptionEnd,
          frozenUntil: null,
        },
      });

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: id,
        action: 'VISITS_BALANCE_UPDATED',
        details: {
          activatedSubscription: true,
          sectionName: subscription.section.name,
          tariffName: subscription.tariff.name,
          previousStatus: subscription.status,
          nextStatus: 'ACTIVE',
          previousVisitsBalance: subscription.visitsBalance,
          nextVisitsBalance,
        },
      });

      return nextSubscription;
    });

    res.json({ message: 'Абонемент активирован', subscription: updated });
  } catch (err) {
    next(err);
  }
}

export async function freezeSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = isStaffRole(req.userRole);
    const { userSubscriptionId, mode, days } = freezeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!isAdmin && req.userId !== id) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const selected = await getSubscriptionForAction(id, userSubscriptionId);
    if (selected.error) {
      return res.status(selected.error.status).json({ message: selected.error.message });
    }
    const subscription = selected.subscription;

    if (subscription.subscriptionEnd < new Date()) {
      return res.status(400).json({ message: 'Нет активного абонемента для заморозки' });
    }
    if (subscription.frozenUntil && subscription.frozenUntil > new Date()) {
      return res.status(400).json({ message: 'Абонемент уже заморожен' });
    }
    if (subscription.tariff?.visitsAmount === 1) {
      return res.status(400).json({ message: 'Разовое посещение нельзя заморозить' });
    }

    const remainingDays = getFreezeDaysRemaining(subscription);
    const requestedDays = mode === 'UNTIL_MANUAL' ? remainingDays : days;
    if (remainingDays < 1) {
      return res.status(400).json({ message: 'Дни заморозки по этому абонементу исчерпаны' });
    }
    if (requestedDays > remainingDays) {
      return res.status(400).json({ message: `Доступно только ${remainingDays} дн. заморозки` });
    }

    const localPlan = subscription.syncId
      ? null
      : createFreezePlan(subscription, { mode, days: requestedDays });

    const sharedState = subscription.syncId
      ? await commandSharedSubscription(subscription.syncId, {
          type: 'FREEZE',
          mode,
          days: requestedDays,
          details: {
            sectionName: subscription.section.name,
            mode,
            requestedDays,
          },
          actorLabel: isAdmin ? `BVA администратор #${req.userId}` : `BVA клиент #${req.userId}`,
          idempotencyKey: createIdempotencyKey(`freeze:${subscription.syncId}`),
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const s = sharedState
        ? await applySharedSubscriptionState(tx, subscription, sharedState)
        : await tx.userSubscription.update({
            where: { id: subscription.id },
            data: {
              frozenUntil: localPlan.frozenUntil,
              freezeStartedAt: localPlan.freezeStartedAt,
              freezeDaysReserved: localPlan.freezeDaysReserved,
              freezeUntilManual: localPlan.freezeUntilManual,
              subscriptionEnd: localPlan.subscriptionEnd,
            },
            include: { section: true, tariff: true },
          });
      if (!sharedState) {
        await tx.user.update({
          where: { id },
          data: {
            frozenUntil: s.frozenUntil,
            subscriptionEnd: s.subscriptionEnd,
          },
        });
      }

      await createAdminAction(tx, {
        adminId: isAdmin ? req.userId : null,
        targetUserId: id,
        action: 'SUBSCRIPTION_FROZEN',
        details: {
          sectionName: subscription.section.name,
          mode,
          requestedDays,
          frozenUntil: s.frozenUntil?.toISOString(),
        },
      });

      return s;
    });

    res.json({
      message: mode === 'UNTIL_MANUAL'
        ? 'Абонемент заморожен до ручной разморозки'
        : `Абонемент заморожен на ${requestedDays} дн.`,
      subscription: subscriptionPublic(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function unfreezeSubscription(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = isStaffRole(req.userRole);
    const userSubscriptionId = req.body?.userSubscriptionId ? parseInt(req.body.userSubscriptionId, 10) : undefined;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!isAdmin && req.userId !== id) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const selected = await getSubscriptionForAction(id, userSubscriptionId);
    if (selected.error) {
      return res.status(selected.error.status).json({ message: selected.error.message });
    }
    const subscription = selected.subscription;

    if (!subscription.frozenUntil || subscription.frozenUntil <= new Date()) {
      return res.status(400).json({ message: 'Абонемент не заморожен' });
    }

    const completed = subscription.syncId ? null : completeFreezePlan(subscription);

    const sharedState = subscription.syncId
      ? await commandSharedSubscription(subscription.syncId, {
          type: 'UNFREEZE',
          details: { sectionName: subscription.section.name },
          actorLabel: isAdmin ? `BVA администратор #${req.userId}` : `BVA клиент #${req.userId}`,
          idempotencyKey: createIdempotencyKey(`unfreeze:${subscription.syncId}`),
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const nextSubscription = sharedState
        ? await applySharedSubscriptionState(tx, subscription, sharedState)
        : await tx.userSubscription.update({
            where: { id: subscription.id },
            data: clearedFreezeData(completed),
            include: { section: true, tariff: true },
          });
      if (!sharedState) {
        await tx.user.update({
          where: { id },
          data: {
            frozenUntil: null,
            subscriptionEnd: nextSubscription.subscriptionEnd,
          },
        });
      }
      await createAdminAction(tx, {
        adminId: isAdmin ? req.userId : null,
        targetUserId: id,
        action: 'SUBSCRIPTION_UNFROZEN',
        details: {
          sectionName: subscription.section.name,
          daysUsed: sharedState?.lastFreezeDaysUsed ?? completed?.consumedDays ?? 0,
          daysRestored: sharedState?.lastFreezeDaysRestored ?? completed?.restoredDays ?? 0,
        },
      });
      return nextSubscription;
    });

    res.json({ message: 'Абонемент разморожен', subscription: subscriptionPublic(updated) });
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
