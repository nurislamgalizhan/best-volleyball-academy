import { centralPool, closePools, sitePools, withTransaction } from './db.js';
import { siteConfig } from './config.js';
import { processProjectionJobs, queueBothSites } from './projections.js';

const apply = process.argv.includes('--apply');

async function loadSectionSnapshot(site) {
  const pool = sitePools[site];
  const section = await pool.query('SELECT id FROM sections WHERE name = $1 LIMIT 1', [siteConfig[site].sectionName]);
  if (!section.rowCount) throw new Error(`Section ${siteConfig[site].sectionName} was not found in ${site}`);
  const sectionId = section.rows[0].id;

  const users = await pool.query(
    `SELECT DISTINCT u.id, u."firstName", u."lastName", u.phone, u."passwordHash",
            u."isVerified", u."isActive", u.role
     FROM users u
     WHERE u.role = 'VISITOR'
       AND (
         EXISTS (
           SELECT 1 FROM user_subscriptions us
           WHERE us."userId" = u.id AND us."sectionId" = $1
         )
         OR EXISTS (
           SELECT 1 FROM section_memberships sm
           WHERE sm."userId" = u.id AND sm."sectionId" = $1
         )
       )
     ORDER BY u.id`,
    [sectionId]
  );

  const subscriptions = await pool.query(
    `SELECT us.*, t.name AS tariff_name, t."visitsAmount" AS tariff_visits,
            t."durationDays" AS tariff_days, t.price AS tariff_price,
            t."timeType" AS tariff_time_type, t."timeStart" AS tariff_time_start,
            t."timeEnd" AS tariff_time_end, u.phone
     FROM user_subscriptions us
     JOIN tariffs t ON t.id = us."tariffId"
     JOIN users u ON u.id = us."userId"
     WHERE us."sectionId" = $1
       AND us.status = 'ACTIVE'
       AND us."subscriptionEnd" > NOW()
     ORDER BY us.id`,
    [sectionId]
  );

  const staleActive = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM user_subscriptions
     WHERE "sectionId" = $1 AND status = 'ACTIVE' AND "subscriptionEnd" <= NOW()`,
    [sectionId]
  );

  return {
    site,
    sectionId,
    users: users.rows,
    subscriptions: subscriptions.rows,
    staleActive: staleActive.rows[0].count,
  };
}

function summarize(mercury, bva) {
  const mercuryPhones = new Set(mercury.users.map((user) => user.phone));
  const bvaPhones = new Set(bva.users.map((user) => user.phone));
  const overlap = [...mercuryPhones].filter((phone) => bvaPhones.has(phone)).length;
  return {
    mode: apply ? 'apply' : 'dry-run',
    mercury: {
      clients: mercury.users.length,
      effectiveActiveSubscriptions: mercury.subscriptions.length,
      staleActiveSubscriptions: mercury.staleActive,
    },
    bva: {
      clients: bva.users.length,
      effectiveActiveSubscriptions: bva.subscriptions.length,
      staleActiveSubscriptions: bva.staleActive,
    },
    sharedPhoneOverlap: overlap,
    expectedSharedMembers: new Set([...mercuryPhones, ...bvaPhones]).size,
    expectedSharedActiveSubscriptions: mercury.subscriptions.length + bva.subscriptions.length,
  };
}

async function upsertMember(sourceSite, user, mercuryPriority) {
  return withTransaction(centralPool, async (client) => {
    const existing = await client.query('SELECT * FROM members WHERE phone = $1 FOR UPDATE', [user.phone]);
    let member;
    if (!existing.rowCount) {
      const inserted = await client.query(
        `INSERT INTO members (phone, first_name, last_name)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [user.phone, user.firstName, user.lastName]
      );
      member = inserted.rows[0];
    } else {
      member = existing.rows[0];
      if (mercuryPriority) {
        const updated = await client.query(
          `UPDATE members
           SET first_name = $1, last_name = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [user.firstName, user.lastName, member.id]
        );
        member = updated.rows[0];
      }
    }

    await client.query(
      `INSERT INTO site_users (member_id, site, local_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id, site) DO UPDATE SET local_user_id = EXCLUDED.local_user_id`,
      [member.id, sourceSite, user.id]
    );
    await queueBothSites(client, 'MEMBER', member.id, 0);
    return member;
  });
}

async function markSourceMembership(snapshot, user, memberId) {
  await sitePools[snapshot.site].query(
    `UPDATE users SET "syncMemberId" = $1 WHERE id = $2`,
    [memberId, user.id]
  );
  await sitePools[snapshot.site].query(
    `INSERT INTO section_memberships ("userId", "sectionId", "sourceSite", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("userId", "sectionId") DO NOTHING`,
    [user.id, snapshot.sectionId, snapshot.site]
  );
}

async function applyMercuryPriorityToBva(mercuryUser, memberId) {
  const result = await sitePools.BVA.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [mercuryUser.phone]);
  if (!result.rowCount) return;
  await sitePools.BVA.query(
    `UPDATE users
     SET "firstName" = $1, "lastName" = $2, "passwordHash" = $3,
         "isVerified" = $4, "syncMemberId" = $5, "updatedAt" = NOW()
     WHERE id = $6 AND role = 'VISITOR'`,
    [
      mercuryUser.firstName,
      mercuryUser.lastName,
      mercuryUser.passwordHash,
      mercuryUser.isVerified,
      memberId,
      result.rows[0].id,
    ]
  );
}

async function findMercuryUserByPhone(phone) {
  const result = await sitePools.MERCURY.query(
    `SELECT id, "firstName", "lastName", phone, "passwordHash", "isVerified", "isActive", role
     FROM users
     WHERE phone = $1
     LIMIT 1`,
    [phone]
  );
  return result.rows[0] || null;
}

async function adoptSubscription(snapshot, subscription, memberId) {
  const plan = {
    name: subscription.tariff_name,
    visitsAmount: subscription.tariff_visits,
    durationDays: subscription.tariff_days,
    price: subscription.tariff_price,
    timeType: subscription.tariff_time_type,
    timeStart: subscription.tariff_time_start,
    timeEnd: subscription.tariff_time_end,
  };

  const shared = await withTransaction(centralPool, async (client) => {
    const existing = await client.query(
      `SELECT * FROM shared_subscriptions
       WHERE origin_site = $1 AND origin_local_subscription_id = $2
       FOR UPDATE`,
      [snapshot.site, subscription.id]
    );
    if (existing.rowCount) return existing.rows[0];

    const conflict = await client.query(
      `SELECT id FROM shared_subscriptions
       WHERE member_id = $1 AND status IN ('PENDING', 'ACTIVE')
       FOR UPDATE`,
      [memberId]
    );
    if (conflict.rowCount) {
      throw new Error(`Active subscription conflict for member ${memberId}`);
    }

    const inserted = await client.query(
      `INSERT INTO shared_subscriptions
        (member_id, origin_site, origin_local_subscription_id, plan, visits_balance,
         subscription_end, frozen_until, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 1, $8, NOW())
       RETURNING *`,
      [
        memberId,
        snapshot.site,
        subscription.id,
        plan,
        subscription.visitsBalance,
        subscription.subscriptionEnd,
        subscription.frozenUntil,
        subscription.createdAt,
      ]
    );
    return inserted.rows[0];
  });

  await sitePools[snapshot.site].query(
    `UPDATE user_subscriptions
     SET "syncId" = $1, "originSite" = $2, "projectionVersion" = GREATEST("projectionVersion", 1)
     WHERE id = $3`,
    [shared.id, snapshot.site, subscription.id]
  );
  await withTransaction(centralPool, (client) => queueBothSites(client, 'SUBSCRIPTION', shared.id, shared.version));

  const visits = await sitePools[snapshot.site].query(
    `SELECT *
     FROM visit_logs
     WHERE "userSubscriptionId" = $1
     ORDER BY "createdAt", id`,
    [subscription.id]
  );
  for (const visit of visits.rows) {
    const sharedVisit = await withTransaction(centralPool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO shared_visits
          (subscription_id, source_site, visits_deducted, guest_count, actor_label,
           is_admin_action, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, NULL, false, $5, $6)
         ON CONFLICT (idempotency_key)
         DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
         RETURNING id`,
        [
          shared.id,
          snapshot.site,
          visit.visitsDeducted,
          visit.guestCount,
          `backfill:${snapshot.site}:visit:${visit.id}`,
          visit.createdAt,
        ]
      );
      await queueBothSites(client, 'VISIT', inserted.rows[0].id, 0);
      return inserted.rows[0];
    });
    await sitePools[snapshot.site].query(
      `UPDATE visit_logs
       SET "syncId" = $1, "sourceSite" = $2
       WHERE id = $3`,
      [sharedVisit.id, snapshot.site, visit.id]
    );
  }
}

async function drainProjections() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await processProjectionJobs();
    const pending = await centralPool.query(
      `SELECT COUNT(*)::int AS count FROM projection_jobs
       WHERE status IN ('PENDING', 'PROCESSING')`
    );
    if (pending.rows[0].count === 0) return;
  }
  throw new Error('Projection queue did not drain');
}

async function run() {
  if (apply && process.env.BACKFILL_CONFIRM !== 'SYNC_VOLLEYBALL') {
    throw new Error('Set BACKFILL_CONFIRM=SYNC_VOLLEYBALL to apply the backfill');
  }

  const [mercury, bva] = await Promise.all([
    loadSectionSnapshot('MERCURY'),
    loadSectionSnapshot('BVA'),
  ]);
  const report = summarize(mercury, bva);
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  const membersByPhone = new Map();
  for (const user of mercury.users) {
    const member = await upsertMember('MERCURY', user, true);
    membersByPhone.set(user.phone, member);
    await markSourceMembership(mercury, user, member.id);
    await applyMercuryPriorityToBva(user, member.id);
  }
  for (const user of bva.users) {
    let member = membersByPhone.get(user.phone);
    if (!member) {
      const mercuryUser = await findMercuryUserByPhone(user.phone);
      if (mercuryUser?.role === 'VISITOR') {
        member = await upsertMember('MERCURY', mercuryUser, true);
        await applyMercuryPriorityToBva(mercuryUser, member.id);
      }
    }
    member = await upsertMember('BVA', user, false);
    membersByPhone.set(user.phone, member);
    await markSourceMembership(bva, user, member.id);
  }

  await drainProjections();

  for (const subscription of mercury.subscriptions) {
    await adoptSubscription(mercury, subscription, membersByPhone.get(subscription.phone).id);
  }
  for (const subscription of bva.subscriptions) {
    await adoptSubscription(bva, subscription, membersByPhone.get(subscription.phone).id);
  }

  await drainProjections();
  const finalState = await centralPool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM members) AS members,
       (SELECT COUNT(*)::int FROM shared_subscriptions WHERE status = 'ACTIVE') AS active_subscriptions,
       (SELECT COUNT(*)::int FROM projection_jobs WHERE status = 'FAILED') AS failed_projections`
  );
  console.log(JSON.stringify({ applied: true, ...finalState.rows[0] }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
