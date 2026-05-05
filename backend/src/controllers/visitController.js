import { prisma } from '../db.js';
import { checkInSchema, adminCheckInSchema, logsQuerySchema, paginationSchema } from '../schemas/index.js';
import { emitNewVisit } from '../socket/index.js';
import { getDuplicateVisitWarning } from '../utils/visits.js';
import { createAdminAction } from '../utils/adminActions.js';

function isTimeAllowed(timeType, timeStart, timeEnd) {
  if (timeType === 'ANY') return true;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (timeStart || '00:00').split(':').map(Number);
  const [endH, endM] = (timeEnd || '23:59').split(':').map(Number);

  return currentMinutes >= startH * 60 + startM && currentMinutes <= endH * 60 + endM;
}

export async function checkIn(req, res, next) {
  try {
    const { visitsDeducted, guestCount, confirmDuplicate } = checkInSchema.parse(req.body);
    const userId = req.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!user.subscriptionEnd) {
      return res.status(400).json({ message: 'У вас нет активного абонемента' });
    }

    if (user.frozenUntil && user.frozenUntil > new Date()) {
      const until = user.frozenUntil.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return res.status(400).json({ message: `Абонемент заморожен до ${until}` });
    }

    if (user.subscriptionEnd < new Date()) {
      if (user.visitsBalance > 0) {
        await prisma.user.update({ where: { id: userId }, data: { visitsBalance: 0 } });
      }
      return res.status(400).json({ message: 'Срок абонемента истек' });
    }

    const [lastSale, lastVisit] = await Promise.all([
      prisma.saleLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { tariff: true },
      }),
      prisma.visitLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (lastSale?.tariff) {
      const { timeType, timeStart, timeEnd } = lastSale.tariff;
      if (!isTimeAllowed(timeType, timeStart, timeEnd)) {
        const timeLabel = timeType === 'MORNING' ? 'утреннему' : 'вечернему';
        return res.status(403).json({
          message: `Посещение по ${timeLabel} тарифу недоступно в текущее время (${timeStart}-${timeEnd})`,
        });
      }
    }

    const hasUnlimitedActive = lastSale?.tariff?.visitsAmount === null;
    if (hasUnlimitedActive && guestCount > 0) {
      return res.status(400).json({ message: 'Безлимитный абонемент не позволяет приглашать гостей' });
    }

    if (!hasUnlimitedActive) {
      if (user.visitsBalance <= 0) {
        return res.status(400).json({ message: 'Недостаточно посещений на балансе' });
      }

      if (visitsDeducted > user.visitsBalance) {
        return res.status(400).json({
          message: `Нельзя списать ${visitsDeducted} посещений — на балансе только ${user.visitsBalance}`,
        });
      }
    }

    const duplicateVisitWarning = getDuplicateVisitWarning(lastVisit?.createdAt);
    if (duplicateVisitWarning && !confirmDuplicate) {
      return res.status(409).json({
        code: 'DUPLICATE_CHECKIN_CONFIRMATION_REQUIRED',
        message: `Вы уже отметились ${duplicateVisitWarning}. Списать еще?`,
        duplicateVisitWarning,
        lastVisitAt: lastVisit.createdAt,
      });
    }

    const [visitLog, updatedUser] = await prisma.$transaction(async (tx) => {
      const log = await tx.visitLog.create({
        data: { userId, visitsDeducted, guestCount },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      });

      if (hasUnlimitedActive) {
        return [log, user];
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { visitsBalance: { decrement: visitsDeducted } },
      });

      return [log, updated];
    });

    emitNewVisit({
      ...visitLog,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, phone: user.phone },
    });

    const guestsLabel = guestCount > 0 ? ` и ${guestCount} гост.` : '';
    res.json({
      message: `Списано ${visitsDeducted} посещ.${guestsLabel}`,
      visitsBalance: updatedUser.visitsBalance,
      visitLog,
    });
  } catch (err) {
    next(err);
  }
}

export async function getVisitLogs(req, res, next) {
  try {
    const { page, limit, from, to, userId } = logsQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      ...(userId && { userId }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [logs, total, aggregate] = await Promise.all([
      prisma.visitLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      prisma.visitLog.count({ where }),
      prisma.visitLog.aggregate({ where, _sum: { visitsDeducted: true } }),
    ]);

    res.json({
      data: logs,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalVisitsDeducted: aggregate._sum.visitsDeducted || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyVisitLogs(req, res, next) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    const where = { userId: req.userId };

    const [logs, total] = await Promise.all([
      prisma.visitLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.visitLog.count({ where }),
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

export async function adminCheckIn(req, res, next) {
  try {
    const { userId, visitsDeducted } = adminCheckInSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!user.subscriptionEnd) {
      return res.status(400).json({ message: 'У клиента нет активного абонемента' });
    }

    if (user.subscriptionEnd < new Date()) {
      return res.status(400).json({ message: 'Срок абонемента клиента истек' });
    }

    const lastSale = await prisma.saleLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { tariff: true },
    });

    const hasUnlimited = lastSale?.tariff?.visitsAmount === null;

    if (!hasUnlimited) {
      if (user.visitsBalance <= 0) {
        return res.status(400).json({ message: 'Недостаточно посещений на балансе клиента' });
      }
      if (visitsDeducted > user.visitsBalance) {
        return res.status(400).json({
          message: `Нельзя списать ${visitsDeducted} посещений — на балансе только ${user.visitsBalance}`,
        });
      }
    }

    const [visitLog] = await prisma.$transaction(async (tx) => {
      const log = await tx.visitLog.create({
        data: { userId, visitsDeducted, guestCount: 0 },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      });

      if (!hasUnlimited) {
        await tx.user.update({
          where: { id: userId },
          data: { visitsBalance: { decrement: visitsDeducted } },
        });
      }

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: userId,
        action: 'ADMIN_VISIT_CHECKIN',
        details: { visitsDeducted, userName: `${user.firstName} ${user.lastName}` },
      });

      return [log];
    });

    emitNewVisit({
      ...visitLog,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, phone: user.phone },
    });

    res.json({ message: `Списано ${visitsDeducted} посещ. (администратором)`, visitLog });
  } catch (err) {
    next(err);
  }
}
