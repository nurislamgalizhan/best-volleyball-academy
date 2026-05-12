export function hasExpiredSubscription(user, now = new Date()) {
  return Boolean(user?.subscriptionEnd && user.subscriptionEnd < now);
}

export async function clearExpiredVisits(prismaClient, user, now = new Date()) {
  if (!hasExpiredSubscription(user, now) || user.visitsBalance <= 0) {
    return user;
  }

  const updated = await prismaClient.user.update({
    where: { id: user.id },
    data: { visitsBalance: 0 },
    select: { visitsBalance: true, updatedAt: true },
  });

  return { ...user, visitsBalance: updated.visitsBalance, updatedAt: updated.updatedAt };
}

export async function clearExpiredVisitsForUsers(prismaClient, now = new Date()) {
  return prismaClient.user.updateMany({
    where: {
      role: 'VISITOR',
      subscriptionEnd: { lt: now },
      visitsBalance: { gt: 0 },
    },
    data: { visitsBalance: 0 },
  });
}
