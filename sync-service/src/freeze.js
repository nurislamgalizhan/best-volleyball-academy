export const MAX_FREEZE_DAYS = 15;
export const DAY_MS = 24 * 60 * 60 * 1000;

function clampDays(value) {
  const days = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return Math.max(0, Math.min(MAX_FREEZE_DAYS, days));
}

export function getFreezeDaysRemaining(subscription) {
  return Math.max(
    0,
    MAX_FREEZE_DAYS
      - clampDays(subscription.freezeDaysUsed)
      - clampDays(subscription.freezeDaysReserved)
  );
}

export function createFreezePlan(subscription, { mode, days }, now = new Date()) {
  const remainingDays = getFreezeDaysRemaining(subscription);
  const requestedDays = mode === 'UNTIL_MANUAL' ? remainingDays : Math.trunc(Number(days));
  if (!Number.isInteger(requestedDays) || requestedDays < 1) {
    throw new Error('Дни заморозки по этому абонементу исчерпаны');
  }
  if (requestedDays > remainingDays) {
    throw new Error(`Доступно только ${remainingDays} дн. заморозки`);
  }
  return {
    ...subscription,
    freezeStartedAt: new Date(now),
    frozenUntil: new Date(now.getTime() + requestedDays * DAY_MS),
    freezeDaysReserved: requestedDays,
    freezeUntilManual: mode === 'UNTIL_MANUAL',
    subscriptionEnd: new Date(new Date(subscription.subscriptionEnd).getTime() + requestedDays * DAY_MS),
    requestedDays,
  };
}

export function completeFreezePlan(subscription, now = new Date()) {
  const usedDays = clampDays(subscription.freezeDaysUsed);
  const reservedDays = clampDays(subscription.freezeDaysReserved);
  const startedAt = subscription.freezeStartedAt ? new Date(subscription.freezeStartedAt) : null;
  const frozenUntil = subscription.frozenUntil ? new Date(subscription.frozenUntil) : null;

  if (!startedAt || !reservedDays || !frozenUntil) {
    return {
      ...subscription,
      frozenUntil: null,
      freezeStartedAt: null,
      freezeDaysUsed: usedDays,
      freezeDaysReserved: 0,
      freezeUntilManual: false,
      lastFreezeDaysUsed: 0,
      lastFreezeDaysRestored: 0,
    };
  }

  const effectiveEnd = new Date(Math.min(now.getTime(), frozenUntil.getTime()));
  const elapsedMs = Math.max(0, effectiveEnd.getTime() - startedAt.getTime());
  const consumedDays = Math.min(reservedDays, Math.max(1, Math.ceil(elapsedMs / DAY_MS)));
  const restoredDays = reservedDays - consumedDays;

  return {
    ...subscription,
    subscriptionEnd: new Date(new Date(subscription.subscriptionEnd).getTime() - restoredDays * DAY_MS),
    frozenUntil: null,
    freezeStartedAt: null,
    freezeDaysUsed: Math.min(MAX_FREEZE_DAYS, usedDays + consumedDays),
    freezeDaysReserved: 0,
    freezeUntilManual: false,
    lastFreezeDaysUsed: consumedDays,
    lastFreezeDaysRestored: restoredDays,
  };
}
