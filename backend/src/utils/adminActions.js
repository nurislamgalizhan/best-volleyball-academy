export async function createAdminAction(tx, payload) {
  return tx.adminActionLog.create({
    data: {
      adminId: payload.adminId,
      targetUserId: payload.targetUserId ?? null,
      action: payload.action,
      details: payload.details ?? null,
    },
  });
}
