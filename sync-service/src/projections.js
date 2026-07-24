import { centralPool, sitePools, withTransaction } from './db.js';
import { oppositeSite, siteConfig } from './config.js';
import { completeFreezePlan } from './freeze.js';

function normalizePlan(plan) {
  return {
    name: String(plan.name),
    visitsAmount: plan.visitsAmount === null ? null : Number(plan.visitsAmount),
    durationDays: Number(plan.durationDays),
    price: Number(plan.price),
    timeType: plan.timeType || 'ANY',
    timeStart: plan.timeStart || null,
    timeEnd: plan.timeEnd || null,
  };
}

async function getSectionId(client, site) {
  const result = await client.query('SELECT id FROM sections WHERE name = $1 LIMIT 1', [siteConfig[site].sectionName]);
  if (!result.rowCount) throw new Error(`Mapped section not found for ${site}`);
  return result.rows[0].id;
}

async function getSourceUser(memberId) {
  const links = await centralPool.query(
    `SELECT site, local_user_id
     FROM site_users
     WHERE member_id = $1
     ORDER BY CASE WHEN site = 'MERCURY' THEN 0 ELSE 1 END`,
    [memberId]
  );
  for (const link of links.rows) {
    const result = await sitePools[link.site].query(
      `SELECT "firstName", "lastName", phone, "passwordHash", "isVerified"
       FROM users WHERE id = $1`,
      [link.local_user_id]
    );
    if (result.rowCount) return result.rows[0];
  }
  throw new Error('Source user for member was not found');
}

async function ensureMemberProjection(client, site, member) {
  let user = await client.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [member.phone]);
  if (!user.rowCount) {
    const source = await getSourceUser(member.id);
    user = await client.query(
      `INSERT INTO users
        ("firstName", "lastName", phone, "passwordHash", role, "isVerified", "isActive", "syncMemberId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'VISITOR', $5, true, $6, NOW(), NOW())
       RETURNING id`,
      [source.firstName, source.lastName, member.phone, source.passwordHash, source.isVerified, member.id]
    );
  } else {
    await client.query(
      `UPDATE users SET "syncMemberId" = COALESCE("syncMemberId", $1) WHERE id = $2`,
      [member.id, user.rows[0].id]
    );
  }

  const userId = user.rows[0].id;
  const sectionId = await getSectionId(client, site);
  await client.query(
    `INSERT INTO section_memberships ("userId", "sectionId", "sourceSite", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("userId", "sectionId")
     DO UPDATE SET "sourceSite" = EXCLUDED."sourceSite"`,
    [userId, sectionId, site]
  );
  await centralPool.query(
    `INSERT INTO site_users (member_id, site, local_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id, site) DO UPDATE SET local_user_id = EXCLUDED.local_user_id`,
    [member.id, site, userId]
  );
  return { userId, sectionId };
}

async function ensureTariff(client, sectionId, planInput) {
  const plan = normalizePlan(planInput);
  const existing = await client.query(
    `SELECT id FROM tariffs
     WHERE "sectionId" = $1
       AND "visitsAmount" IS NOT DISTINCT FROM $2
       AND "durationDays" = $3
       AND price = $4
       AND "timeType" = $5
     ORDER BY "isSyncMirror" ASC, id ASC
     LIMIT 1`,
    [sectionId, plan.visitsAmount, plan.durationDays, plan.price, plan.timeType]
  );
  if (existing.rowCount) return existing.rows[0].id;

  const created = await client.query(
    `INSERT INTO tariffs
      ("sectionId", name, "visitsAmount", "durationDays", price, "isActive", "isSyncMirror",
       "timeType", "timeStart", "timeEnd", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, false, true, $6, $7, $8, NOW(), NOW())
     RETURNING id`,
    [sectionId, plan.name, plan.visitsAmount, plan.durationDays, plan.price, plan.timeType, plan.timeStart, plan.timeEnd]
  );
  return created.rows[0].id;
}

async function loadSubscription(syncId) {
  const result = await centralPool.query(
    `SELECT s.*, m.phone, m.first_name, m.last_name
     FROM shared_subscriptions s
     JOIN members m ON m.id = s.member_id
     WHERE s.id = $1`,
    [syncId]
  );
  if (!result.rowCount) throw new Error('Shared subscription not found');
  return result.rows[0];
}

async function ensureSubscriptionProjection(client, site, subscription) {
  const member = {
    id: subscription.member_id,
    phone: subscription.phone,
    firstName: subscription.first_name,
    lastName: subscription.last_name,
  };
  const { userId, sectionId } = await ensureMemberProjection(client, site, member);
  const tariffId = await ensureTariff(client, sectionId, subscription.plan);

  let local = await client.query('SELECT id, "projectionVersion" FROM user_subscriptions WHERE "syncId" = $1', [subscription.id]);
  if (!local.rowCount && site === subscription.origin_site && subscription.origin_local_subscription_id) {
    local = await client.query('SELECT id, "projectionVersion" FROM user_subscriptions WHERE id = $1', [subscription.origin_local_subscription_id]);
  }

  if (local.rowCount) {
    const updated = await client.query(
      `UPDATE user_subscriptions
       SET "userId" = $1, "sectionId" = $2, "tariffId" = $3,
           "visitsBalance" = $4, "subscriptionEnd" = $5, "frozenUntil" = $6,
           "freezeStartedAt" = $7, "freezeDaysUsed" = $8,
           "freezeDaysReserved" = $9, "freezeUntilManual" = $10,
           status = $11, "syncId" = $12, "originSite" = $13,
           "projectionVersion" = $14, "updatedAt" = NOW()
       WHERE id = $15 AND "projectionVersion" <= $14`,
      [
        userId,
        sectionId,
        tariffId,
        subscription.visits_balance,
        subscription.subscription_end,
        subscription.frozen_until,
        subscription.freeze_started_at,
        subscription.freeze_days_used,
        subscription.freeze_days_reserved,
        subscription.freeze_until_manual,
        subscription.status,
        subscription.id,
        subscription.origin_site,
        subscription.version,
        local.rows[0].id,
      ]
    );
    if (updated.rowCount) {
      await client.query(
        `UPDATE users
         SET "visitsBalance" = $1, "subscriptionEnd" = $2, "frozenUntil" = $3, "updatedAt" = NOW()
         WHERE id = $4`,
        [
          subscription.visits_balance,
          subscription.subscription_end,
          subscription.frozen_until,
          userId,
        ]
      );
    }
    return { localSubscriptionId: local.rows[0].id, userId, sectionId };
  }

  const inserted = await client.query(
    `INSERT INTO user_subscriptions
      ("userId", "sectionId", "tariffId", "visitsBalance", "subscriptionEnd", "frozenUntil",
       "freezeStartedAt", "freezeDaysUsed", "freezeDaysReserved", "freezeUntilManual",
       status, "syncId", "originSite", "projectionVersion", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     RETURNING id`,
    [
      userId,
      sectionId,
      tariffId,
      subscription.visits_balance,
      subscription.subscription_end,
      subscription.frozen_until,
      subscription.freeze_started_at,
      subscription.freeze_days_used,
      subscription.freeze_days_reserved,
      subscription.freeze_until_manual,
      subscription.status,
      subscription.id,
      subscription.origin_site,
      subscription.version,
      subscription.created_at,
    ]
  );
  await client.query(
    `UPDATE users
     SET "visitsBalance" = $1, "subscriptionEnd" = $2, "frozenUntil" = $3, "updatedAt" = NOW()
     WHERE id = $4`,
    [
      subscription.visits_balance,
      subscription.subscription_end,
      subscription.frozen_until,
      userId,
    ]
  );
  return { localSubscriptionId: inserted.rows[0].id, userId, sectionId };
}

async function projectSubscription(site, syncId) {
  const subscription = await loadSubscription(syncId);
  if (subscription.status === 'PENDING') return;
  await withTransaction(sitePools[site], (client) => ensureSubscriptionProjection(client, site, subscription));
}

async function projectMember(site, memberId) {
  const result = await centralPool.query('SELECT * FROM members WHERE id = $1', [memberId]);
  if (!result.rowCount) throw new Error('Member not found');
  await withTransaction(sitePools[site], (client) => ensureMemberProjection(client, site, result.rows[0]));
}

async function projectVisit(site, visitId) {
  const result = await centralPool.query(
    `SELECT v.*, s.id AS shared_subscription_id
     FROM shared_visits v
     JOIN shared_subscriptions s ON s.id = v.subscription_id
     WHERE v.id = $1`,
    [visitId]
  );
  if (!result.rowCount) throw new Error('Shared visit not found');
  const visit = result.rows[0];
  const subscription = await loadSubscription(visit.shared_subscription_id);

  await withTransaction(sitePools[site], async (client) => {
    const projection = await ensureSubscriptionProjection(client, site, subscription);
    await client.query(
      `INSERT INTO visit_logs
        ("userId", "sectionId", "userSubscriptionId", "visitsDeducted", "guestCount",
         "syncId", "sourceSite", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("syncId") DO NOTHING`,
      [
        projection.userId,
        projection.sectionId,
        projection.localSubscriptionId,
        visit.visits_deducted,
        visit.guest_count,
        visit.id,
        visit.source_site,
        visit.created_at,
      ]
    );
  });
}

async function projectAction(site, actionId) {
  const result = await centralPool.query(
    `SELECT a.*, s.member_id
     FROM shared_actions a
     JOIN shared_subscriptions s ON s.id = a.subscription_id
     WHERE a.id = $1`,
    [actionId]
  );
  if (!result.rowCount) throw new Error('Shared action not found');
  const action = result.rows[0];
  const member = await centralPool.query('SELECT * FROM members WHERE id = $1', [action.member_id]);
  await withTransaction(sitePools[site], async (client) => {
    const projection = await ensureMemberProjection(client, site, member.rows[0]);
    await client.query(
      `INSERT INTO admin_action_logs
        ("adminId", "targetUserId", action, details, "syncId", "sourceSite", "sourceActorLabel", "createdAt")
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("syncId") DO NOTHING`,
      [
        projection.userId,
        action.action_type,
        action.details,
        action.id,
        action.source_site,
        action.actor_label,
        action.created_at,
      ]
    );
  });
}

async function applyJob(job) {
  if (job.event_type === 'MEMBER') return projectMember(job.target_site, job.entity_id);
  if (job.event_type === 'SUBSCRIPTION') return projectSubscription(job.target_site, job.entity_id);
  if (job.event_type === 'VISIT') return projectVisit(job.target_site, job.entity_id);
  if (job.event_type === 'ACTION') return projectAction(job.target_site, job.entity_id);
  throw new Error(`Unsupported projection event ${job.event_type}`);
}

let workerRunning = false;

export async function processProjectionJobs() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await centralPool.query(
      `UPDATE projection_jobs
       SET status = 'PENDING', updated_at = NOW()
       WHERE status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '2 minutes'`
    );
    for (let index = 0; index < 30; index += 1) {
      const claimed = await withTransaction(centralPool, async (client) => {
        const result = await client.query(
          `SELECT * FROM projection_jobs
           WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= NOW()
           ORDER BY id
           FOR UPDATE SKIP LOCKED
           LIMIT 1`
        );
        if (!result.rowCount) return null;
        const job = result.rows[0];
        await client.query(
          `UPDATE projection_jobs
           SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
           WHERE id = $1`,
          [job.id]
        );
        return job;
      });
      if (!claimed) break;
      try {
        await applyJob(claimed);
        await centralPool.query(
          `UPDATE projection_jobs SET status = 'DONE', last_error = NULL, updated_at = NOW() WHERE id = $1`,
          [claimed.id]
        );
      } catch (error) {
        const delaySeconds = Math.min(300, 2 ** Math.min(claimed.attempts + 1, 8));
        await centralPool.query(
          `UPDATE projection_jobs
           SET status = 'FAILED', last_error = $2,
               next_attempt_at = NOW() + ($3 || ' seconds')::interval, updated_at = NOW()
           WHERE id = $1`,
          [claimed.id, error.message.slice(0, 1000), delaySeconds]
        );
      }
    }
  } finally {
    workerRunning = false;
  }
}

export async function waitForProjectionWorker() {
  while (workerRunning) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function queueProjection(client, eventType, entityId, targetSite, version = 0) {
  await client.query(
    `INSERT INTO projection_jobs (event_type, entity_id, target_site, version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_type, entity_id, target_site, version)
     DO UPDATE SET status = CASE WHEN projection_jobs.status = 'DONE' THEN 'DONE' ELSE 'PENDING' END,
                   next_attempt_at = NOW(), updated_at = NOW()`,
    [eventType, entityId, targetSite, version]
  );
}

export async function queueBothSites(client, eventType, entityId, version = 0) {
  await queueProjection(client, eventType, entityId, 'MERCURY', version);
  await queueProjection(client, eventType, entityId, 'BVA', version);
}

export async function queueOppositeSite(client, eventType, entityId, sourceSite, version = 0) {
  await queueProjection(client, eventType, entityId, oppositeSite(sourceSite), version);
}

async function forceQueueBothSites(client, eventType, entityId, version = 0) {
  for (const targetSite of ['MERCURY', 'BVA']) {
    await client.query(
      `INSERT INTO projection_jobs (event_type, entity_id, target_site, version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_type, entity_id, target_site, version)
       DO UPDATE SET status = 'PENDING', attempts = 0, next_attempt_at = NOW(),
                     last_error = NULL, updated_at = NOW()`,
      [eventType, entityId, targetSite, version]
    );
  }
}

export async function reconcileAll() {
  const pending = await centralPool.query(
    `SELECT *
     FROM shared_subscriptions
     WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '10 seconds'`
  );
  for (const subscription of pending.rows) {
    const local = await sitePools[subscription.origin_site].query(
      `SELECT id FROM user_subscriptions WHERE "syncId" = $1 LIMIT 1`,
      [subscription.id]
    );
    if (local.rowCount) {
      await withTransaction(centralPool, async (client) => {
        const updated = await client.query(
          `UPDATE shared_subscriptions
           SET origin_local_subscription_id = $1, status = 'ACTIVE',
               version = GREATEST(version, 1), updated_at = NOW()
           WHERE id = $2 AND status = 'PENDING'
           RETURNING version`,
          [local.rows[0].id, subscription.id]
        );
        if (updated.rowCount) {
          await queueBothSites(client, 'SUBSCRIPTION', subscription.id, updated.rows[0].version);
        }
      });
    } else if (new Date(subscription.created_at).getTime() < Date.now() - 15 * 60 * 1000) {
      await centralPool.query(
        `UPDATE shared_subscriptions
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = $1 AND status = 'PENDING'`,
        [subscription.id]
      );
    }
  }

  const dueFreezes = await centralPool.query(
    `SELECT id FROM shared_subscriptions
     WHERE status = 'ACTIVE' AND frozen_until IS NOT NULL AND frozen_until <= NOW()`
  );
  for (const due of dueFreezes.rows) {
    await withTransaction(centralPool, async (client) => {
      const selected = await client.query(
        `SELECT * FROM shared_subscriptions
         WHERE id = $1 AND frozen_until IS NOT NULL AND frozen_until <= NOW()
         FOR UPDATE`,
        [due.id]
      );
      if (!selected.rowCount) return;
      const row = selected.rows[0];
      const completed = completeFreezePlan({
        subscriptionEnd: row.subscription_end,
        frozenUntil: row.frozen_until,
        freezeStartedAt: row.freeze_started_at,
        freezeDaysUsed: row.freeze_days_used,
        freezeDaysReserved: row.freeze_days_reserved,
        freezeUntilManual: row.freeze_until_manual,
      }, new Date(row.frozen_until));
      const updated = await client.query(
        `UPDATE shared_subscriptions
         SET subscription_end = $1, frozen_until = NULL, freeze_started_at = NULL,
             freeze_days_used = $2, freeze_days_reserved = 0,
             freeze_until_manual = false, version = version + 1, updated_at = NOW()
         WHERE id = $3
         RETURNING version`,
        [completed.subscriptionEnd, completed.freezeDaysUsed, row.id]
      );
      const action = await client.query(
        `INSERT INTO shared_actions
          (subscription_id, source_site, actor_label, action_type, details)
         VALUES ($1, $2, 'Автоматическая разморозка', 'SUBSCRIPTION_UNFROZEN', $3)
         RETURNING id`,
        [
          row.id,
          row.origin_site,
          {
            automatic: true,
            daysUsed: completed.lastFreezeDaysUsed,
            daysRestored: completed.lastFreezeDaysRestored,
          },
        ]
      );
      await queueBothSites(client, 'SUBSCRIPTION', row.id, updated.rows[0].version);
      await queueBothSites(client, 'ACTION', action.rows[0].id, 0);
    });
  }

  const expired = await centralPool.query(
    `UPDATE shared_subscriptions
     SET status = 'EXPIRED', visits_balance = 0, frozen_until = NULL,
         freeze_started_at = NULL, freeze_days_reserved = 0, freeze_until_manual = false,
         version = version + 1, updated_at = NOW()
     WHERE status = 'ACTIVE' AND subscription_end <= NOW()
     RETURNING id, version`
  );
  if (expired.rowCount) {
    await withTransaction(centralPool, async (client) => {
      for (const subscription of expired.rows) {
        await queueBothSites(client, 'SUBSCRIPTION', subscription.id, subscription.version);
      }
    });
  }

  const [members, subscriptions, visits] = await Promise.all([
    centralPool.query('SELECT id FROM members'),
    centralPool.query(
      `SELECT id, version FROM shared_subscriptions WHERE status <> 'PENDING'`
    ),
    centralPool.query('SELECT id FROM shared_visits'),
  ]);
  await withTransaction(centralPool, async (client) => {
    for (const member of members.rows) {
      await forceQueueBothSites(client, 'MEMBER', member.id, 0);
    }
    for (const subscription of subscriptions.rows) {
      await forceQueueBothSites(client, 'SUBSCRIPTION', subscription.id, subscription.version);
    }
    for (const visit of visits.rows) {
      await forceQueueBothSites(client, 'VISIT', visit.id, 0);
    }
  });
}
