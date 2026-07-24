import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.SYNC_TEST_URL || 'http://127.0.0.1:44100';
const secret = process.env.SYNC_HMAC_SECRET;
if (!secret) throw new Error('SYNC_HMAC_SECRET is required');

const mercury = new Pool({ connectionString: process.env.MERCURY_DATABASE_URL });
const bva = new Pool({ connectionString: process.env.BVA_DATABASE_URL });
const central = new Pool({ connectionString: process.env.DATABASE_URL });

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

async function syncRequest(path, body) {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.POST.${path}.${stableStringify(body)}`)
    .digest('hex');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-timestamp': timestamp,
      'x-sync-signature': signature,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function waitUntil(assertion, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function seedSite(pool, sectionName, withUser) {
  const section = await pool.query(
    `INSERT INTO sections (name, "isActive", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, true, 0, NOW(), NOW())
     RETURNING id`,
    [sectionName]
  );
  if (!withUser) return { sectionId: section.rows[0].id };

  const user = await pool.query(
    `INSERT INTO users
      ("firstName", "lastName", phone, "passwordHash", role, "isVerified", "isActive", "createdAt", "updatedAt")
     VALUES ('Тест', 'Синхронизации', '77000000001', 'hash', 'VISITOR', true, true, NOW(), NOW())
     RETURNING id`
  );
  const tariff = await pool.query(
    `INSERT INTO tariffs
      ("sectionId", name, "visitsAmount", "durationDays", price, "isActive", "isSyncMirror",
       "timeType", "createdAt", "updatedAt")
     VALUES ($1, 'Тестовый тариф', 1, 30, 10000, true, false, 'ANY', NOW(), NOW())
     RETURNING id`,
    [section.rows[0].id]
  );
  return {
    sectionId: section.rows[0].id,
    userId: user.rows[0].id,
    tariffId: tariff.rows[0].id,
  };
}

async function run() {
  const mercurySeed = await seedSite(mercury, 'Волейбол', false);
  const bvaSeed = await seedSite(bva, 'Волейбол (Коперника 130)', true);
  const subscriptionEnd = new Date(Date.now() + 30 * 86400_000);
  const plan = {
    name: 'Тестовый тариф',
    visitsAmount: 1,
    durationDays: 30,
    price: 10000,
    timeType: 'ANY',
    timeStart: null,
    timeEnd: null,
  };

  const prepared = await syncRequest('/v1/subscriptions/prepare', {
    sourceSite: 'BVA',
    user: {
      id: bvaSeed.userId,
      firstName: 'Тест',
      lastName: 'Синхронизации',
      phone: '77000000001',
    },
    plan,
    subscriptionEnd: subscriptionEnd.toISOString(),
    idempotencyKey: 'integration-prepare',
  });
  assert.equal(prepared.status, 201, JSON.stringify(prepared.data));

  const local = await bva.query(
    `INSERT INTO user_subscriptions
      ("userId", "sectionId", "tariffId", "visitsBalance", "subscriptionEnd", status,
       "syncId", "originSite", "projectionVersion", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 1, $4, 'ACTIVE', $5, 'BVA', 0, NOW(), NOW())
     RETURNING id`,
    [bvaSeed.userId, bvaSeed.sectionId, bvaSeed.tariffId, subscriptionEnd, prepared.data.syncId]
  );

  const confirmed = await syncRequest('/v1/subscriptions/confirm', {
    sourceSite: 'BVA',
    syncId: prepared.data.syncId,
    localSubscriptionId: local.rows[0].id,
    idempotencyKey: 'integration-confirm',
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));

  await waitUntil(async () => {
    const projected = await mercury.query(
      `SELECT us."visitsBalance", us.status, u.phone
       FROM user_subscriptions us
       JOIN users u ON u.id = us."userId"
       WHERE us."syncId" = $1`,
      [prepared.data.syncId]
    );
    assert.equal(projected.rowCount, 1);
    assert.equal(projected.rows[0].phone, '77000000001');
    assert.equal(projected.rows[0].visitsBalance, 1);
  });

  const checkIn = (key) => syncRequest('/v1/checkins', {
    sourceSite: 'BVA',
    syncId: prepared.data.syncId,
    visitsDeducted: 1,
    guestCount: 0,
    confirmDuplicate: true,
    idempotencyKey: key,
  });
  const checkIns = await Promise.all([checkIn('integration-checkin-a'), checkIn('integration-checkin-b')]);
  assert.deepEqual(checkIns.map((result) => result.status).sort(), [200, 400]);

  await waitUntil(async () => {
    for (const pool of [mercury, bva]) {
      const subscription = await pool.query(
        `SELECT "visitsBalance", status FROM user_subscriptions WHERE "syncId" = $1`,
        [prepared.data.syncId]
      );
      assert.equal(subscription.rows[0].visitsBalance, 0);
      assert.equal(subscription.rows[0].status, 'EXPIRED');
      const visits = await pool.query(
        `SELECT COUNT(*)::int AS count FROM visit_logs WHERE "userSubscriptionId" = (
           SELECT id FROM user_subscriptions WHERE "syncId" = $1
         )`,
        [prepared.data.syncId]
      );
      assert.equal(visits.rows[0].count, 1);
    }
  });

  await mercury.query(
    `DELETE FROM visit_logs
     WHERE "userSubscriptionId" = (
       SELECT id FROM user_subscriptions WHERE "syncId" = $1
     )`,
    [prepared.data.syncId]
  );
  await mercury.query(
    `UPDATE user_subscriptions SET "visitsBalance" = 99 WHERE "syncId" = $1`,
    [prepared.data.syncId]
  );
  await waitUntil(async () => {
    const subscription = await mercury.query(
      `SELECT "visitsBalance" FROM user_subscriptions WHERE "syncId" = $1`,
      [prepared.data.syncId]
    );
    assert.equal(subscription.rows[0].visitsBalance, 0);
    const visits = await mercury.query(
      `SELECT COUNT(*)::int AS count FROM visit_logs WHERE "userSubscriptionId" = (
         SELECT id FROM user_subscriptions WHERE "syncId" = $1
       )`,
      [prepared.data.syncId]
    );
    assert.equal(visits.rows[0].count, 1);
  }, 15_000);

  const activationBody = {
    sourceSite: 'MERCURY',
    type: 'ACTIVATE',
    visitsBalance: 1,
    actorLabel: 'Integration test',
    idempotencyKey: 'integration-activate',
  };
  const activated = await syncRequest(
    `/v1/subscriptions/${prepared.data.syncId}/command`,
    activationBody
  );
  assert.equal(activated.status, 200, JSON.stringify(activated.data));
  const activatedAgain = await syncRequest(
    `/v1/subscriptions/${prepared.data.syncId}/command`,
    activationBody
  );
  assert.equal(activatedAgain.data.version, activated.data.version);

  await waitUntil(async () => {
    const states = await Promise.all(
      [mercury, bva].map((pool) =>
        pool.query(
          `SELECT "visitsBalance", status FROM user_subscriptions WHERE "syncId" = $1`,
          [prepared.data.syncId]
        )
      )
    );
    for (const state of states) {
      assert.equal(state.rows[0].visitsBalance, 1);
      assert.equal(state.rows[0].status, 'ACTIVE');
    }
  });

  const fixedFreeze = await syncRequest(
    `/v1/subscriptions/${prepared.data.syncId}/command`,
    {
      sourceSite: 'MERCURY',
      type: 'FREEZE',
      mode: 'FIXED',
      days: 10,
      actorLabel: 'Integration test',
      idempotencyKey: 'integration-freeze-fixed',
    }
  );
  assert.equal(fixedFreeze.status, 200, JSON.stringify(fixedFreeze.data));
  assert.equal(fixedFreeze.data.freezeDaysReserved, 10);
  assert.equal(fixedFreeze.data.freezeDaysRemaining, undefined);

  await waitUntil(async () => {
    for (const pool of [mercury, bva]) {
      const state = await pool.query(
        `SELECT "freezeDaysReserved", "freezeUntilManual", "frozenUntil"
         FROM user_subscriptions WHERE "syncId" = $1`,
        [prepared.data.syncId]
      );
      assert.equal(state.rows[0].freezeDaysReserved, 10);
      assert.equal(state.rows[0].freezeUntilManual, false);
      assert.ok(state.rows[0].frozenUntil);
    }
  });

  const manuallyUnfrozen = await syncRequest(
    `/v1/subscriptions/${prepared.data.syncId}/command`,
    {
      sourceSite: 'BVA',
      type: 'UNFREEZE',
      actorLabel: 'Integration test',
      idempotencyKey: 'integration-unfreeze-fixed',
    }
  );
  assert.equal(manuallyUnfrozen.status, 200, JSON.stringify(manuallyUnfrozen.data));
  assert.equal(manuallyUnfrozen.data.freezeDaysUsed, 1);
  assert.equal(manuallyUnfrozen.data.freezeDaysReserved, 0);
  assert.equal(manuallyUnfrozen.data.lastFreezeDaysRestored, 9);

  const untilManual = await syncRequest(
    `/v1/subscriptions/${prepared.data.syncId}/command`,
    {
      sourceSite: 'MERCURY',
      type: 'FREEZE',
      mode: 'UNTIL_MANUAL',
      actorLabel: 'Integration test',
      idempotencyKey: 'integration-freeze-until-manual',
    }
  );
  assert.equal(untilManual.status, 200, JSON.stringify(untilManual.data));
  assert.equal(untilManual.data.freezeDaysReserved, 14);
  assert.equal(untilManual.data.freezeUntilManual, true);

  await central.query(
    `UPDATE shared_subscriptions
     SET freeze_started_at = NOW() - INTERVAL '14 days',
         frozen_until = NOW() - INTERVAL '1 second'
     WHERE id = $1`,
    [prepared.data.syncId]
  );

  await waitUntil(async () => {
    for (const pool of [mercury, bva]) {
      const state = await pool.query(
        `SELECT "freezeDaysUsed", "freezeDaysReserved", "freezeUntilManual", "frozenUntil"
         FROM user_subscriptions WHERE "syncId" = $1`,
        [prepared.data.syncId]
      );
      assert.equal(state.rows[0].freezeDaysUsed, 15);
      assert.equal(state.rows[0].freezeDaysReserved, 0);
      assert.equal(state.rows[0].freezeUntilManual, false);
      assert.equal(state.rows[0].frozenUntil, null);
    }
  }, 15_000);

  const sales = await Promise.all([
    mercury.query('SELECT COUNT(*)::int AS count FROM sale_logs'),
    bva.query('SELECT COUNT(*)::int AS count FROM sale_logs'),
  ]);
  assert.deepEqual(sales.map((result) => result.rows[0].count), [0, 0]);
  assert.ok(mercurySeed.sectionId);
  console.log('Integration sync test passed');
}

run()
  .finally(async () => {
    await Promise.all([mercury.end(), bva.end(), central.end()]);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
