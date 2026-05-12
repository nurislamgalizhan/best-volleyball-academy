import { prisma } from '../db.js';
import { clearExpiredVisits } from './subscription.js';

const TIME_TYPE_LABELS = {
  ANY: 'Любое время',
  MORNING: 'Утреннее время',
  EVENING: 'Вечернее время',
};

function sanitizeUser(user) {
  const { passwordHash, verificationCode, verificationCodeExpires, ...rest } = user;
  return rest;
}

function buildTariffWindowLabel(tariff) {
  if (!tariff) return null;
  if (tariff.timeType === 'ANY') return TIME_TYPE_LABELS.ANY;
  if (tariff.timeStart && tariff.timeEnd) {
    return `${TIME_TYPE_LABELS[tariff.timeType]}: ${tariff.timeStart}-${tariff.timeEnd}`;
  }
  return TIME_TYPE_LABELS[tariff.timeType];
}

export async function buildUserProfile(inputUser) {
  const user = await clearExpiredVisits(prisma, inputUser);

  const lastSale = await prisma.saleLog.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { tariff: true },
  });

  const hasActiveSubscription = Boolean(user.subscriptionEnd && user.subscriptionEnd > new Date());
  const currentTariff = hasActiveSubscription && lastSale?.tariff
    ? {
        id: lastSale.tariff.id,
        name: lastSale.tariff.name,
        visitsAmount: lastSale.tariff.visitsAmount,
        durationDays: lastSale.tariff.durationDays,
        price: lastSale.tariff.price,
        timeType: lastSale.tariff.timeType,
        timeStart: lastSale.tariff.timeStart,
        timeEnd: lastSale.tariff.timeEnd,
        accessLabel: buildTariffWindowLabel(lastSale.tariff),
      }
    : null;

  const isSingleVisitTariff = Boolean(lastSale?.tariff?.visitsAmount === 1);

  return {
    ...sanitizeUser(user),
    isUnlimitedSubscription: Boolean(currentTariff && currentTariff.visitsAmount === null),
    isSingleVisitTariff,
    currentTariff,
  };
}
