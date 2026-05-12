import { prisma } from '../db.js';
import { sellTariffSchema, logsQuerySchema } from '../schemas/index.js';
import { createAdminAction } from '../utils/adminActions.js';
import { clearExpiredVisits } from '../utils/subscription.js';

export async function sellTariff(req, res, next) {
  try {
    const { userId, tariffId, pricePaid, paymentMethod, cashAmount, cardAmount, cardProvider } = sellTariffSchema.parse(req.body);

    const resolvedCardProvider =
      paymentMethod === 'KASPI' ? 'KASPI'
      : paymentMethod === 'HALYK' ? 'HALYK'
      : paymentMethod === 'MIXED' ? cardProvider
      : null;
    const resolvedCash = paymentMethod === 'CASH' ? pricePaid : paymentMethod === 'MIXED' ? cashAmount : 0;
    const resolvedCard = paymentMethod === 'KASPI' || paymentMethod === 'HALYK' ? pricePaid : paymentMethod === 'MIXED' ? cardAmount : 0;

    const [foundUser, tariff] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.tariff.findUnique({ where: { id: tariffId } }),
    ]);

    let user = foundUser;

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: 'Нельзя продавать абонемент не верифицированному пользователю' });
    }

    if (user.role === 'ADMIN') {
      return res.status(403).json({ message: 'Нельзя продавать абонемент администратору' });
    }

    if (!tariff || !tariff.isActive) {
      return res.status(404).json({ message: 'Тариф не найден или неактивен' });
    }

    const now = new Date();
    user = await clearExpiredVisits(prisma, user, now);

    const lastSale = await prisma.saleLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { tariff: { select: { visitsAmount: true } } },
    });

    const hasActiveUnlimited =
      lastSale?.tariff?.visitsAmount === null &&
      user.subscriptionEnd &&
      user.subscriptionEnd > now;

    if (user.visitsBalance > 0) {
      return res.status(400).json({
        message: `У клиента есть ${user.visitsBalance} неиспользованных посещений. Продажа невозможна до использования текущего баланса.`,
      });
    }

    if (hasActiveUnlimited) {
      return res.status(400).json({
        message: 'У клиента действует безлимитный абонемент. Продажа невозможна до истечения срока.',
      });
    }

    const isUnlimited = tariff.visitsAmount === null;
    const subscriptionEnd = new Date();
    subscriptionEnd.setDate(subscriptionEnd.getDate() + tariff.durationDays);

    await prisma.$transaction(async (tx) => {
      await tx.saleLog.create({
        data: {
          userId,
          tariffId,
          pricePaid,
          paymentMethod,
          cashAmount: resolvedCash,
          cardAmount: resolvedCard,
          cardProvider: resolvedCardProvider,
        },
      });

      if (isUnlimited) {
        await tx.user.update({
          where: { id: userId },
          data: { subscriptionEnd, visitsBalance: 0 },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { visitsBalance: { increment: tariff.visitsAmount }, subscriptionEnd },
        });
      }

      await createAdminAction(tx, {
        adminId: req.userId,
        targetUserId: userId,
        action: 'TARIFF_SOLD',
        details: {
          tariffName: tariff.name,
          pricePaid,
          visitsAmount: tariff.visitsAmount,
          durationDays: tariff.durationDays,
          paymentMethod,
          cashAmount: resolvedCash,
          cardAmount: resolvedCard,
          cardProvider: resolvedCardProvider,
        },
      });
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, visitsBalance: true, subscriptionEnd: true },
    });

    res.status(201).json({ message: 'Абонемент продан успешно', user: updated });
  } catch (err) {
    next(err);
  }
}

export async function getSaleLogs(req, res, next) {
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

    const [logs, total, totalRevenue] = await Promise.all([
      prisma.saleLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
          tariff: { select: { id: true, name: true, timeType: true } },
        },
      }),
      prisma.saleLog.count({ where }),
      prisma.saleLog.aggregate({ where, _sum: { pricePaid: true } }),
    ]);

    res.json({
      data: logs,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalRevenue: totalRevenue._sum.pricePaid || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
