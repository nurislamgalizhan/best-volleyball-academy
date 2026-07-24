import express from 'express';
import { randomUUID } from 'node:crypto';
import { config, assertSite } from './config.js';
import { centralPool, closePools, ensureCentralSchema, withTransaction } from './db.js';
import { verifyHmac } from './security.js';
import {
  completeFreezePlan,
  createFreezePlan,
} from './freeze.js';
import {
  processProjectionJobs,
  queueBothSites,
  queueOppositeSite,
  reconcileAll,
  waitForProjectionWorker,
} from './projections.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function serializeSubscription(row) {
  return {
    syncId: row.id,
    memberId: row.member_id,
    status: row.status,
    visitsBalance: row.visits_balance,
    subscriptionEnd: row.subscription_end,
    frozenUntil: row.frozen_until,
    freezeStartedAt: row.freeze_started_at,
    freezeDaysUsed: row.freeze_days_used,
    freezeDaysReserved: row.freeze_days_reserved,
    freezeUntilManual: row.freeze_until_manual,
    version: row.version,
    plan: row.plan,
    originSite: row.origin_site,
  };
}

function plansEqual(left, right) {
  const keys = ['name', 'visitsAmount', 'durationDays', 'price', 'timeType', 'timeStart', 'timeEnd'];
  return keys.every((key) => (left?.[key] ?? null) === (right?.[key] ?? null));
}

async function getStoredCommand(client, idempotencyKey) {
  const result = await client.query('SELECT response FROM commands WHERE idempotency_key = $1', [idempotencyKey]);
  return result.rows[0]?.response || null;
}

async function saveCommand(client, { idempotencyKey, sourceSite, commandType, response }) {
  await client.query(
    `INSERT INTO commands (idempotency_key, source_site, command_type, response)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [idempotencyKey, sourceSite, commandType, response]
  );
}

async function upsertMember(client, user, sourceSite) {
  const member = await client.query(
    `INSERT INTO members (phone, first_name, last_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [user.phone, user.firstName, user.lastName]
  );
  await client.query(
    `INSERT INTO site_users (member_id, site, local_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id, site) DO UPDATE SET local_user_id = EXCLUDED.local_user_id`,
    [member.rows[0].id, sourceSite, user.id]
  );
  return member.rows[0];
}

let shuttingDown = false;

function queueWorker() {
  if (shuttingDown) return;
  setImmediate(() => {
    if (!shuttingDown) {
      processProjectionJobs().catch((error) => console.error('[projection]', error.message));
    }
  });
}

app.get('/health', async (req, res, next) => {
  try {
    await centralPool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use('/v1', verifyHmac);

app.get('/v1/status', async (req, res, next) => {
  try {
    const result = await centralPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING', 'FAILED'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
         COALESCE(EXTRACT(EPOCH FROM (
           NOW() - (MIN(created_at)
             FILTER (WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')))
         )), 0)::int AS lag_seconds
       FROM projection_jobs`
    );
    res.json({
      status: result.rows[0].failed > 0 ? 'degraded' : 'ok',
      pendingProjections: result.rows[0].pending,
      failedProjections: result.rows[0].failed,
      lagSeconds: result.rows[0].lag_seconds,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/v1/subscriptions/prepare', async (req, res, next) => {
  try {
    const { sourceSite: rawSite, user, plan, subscriptionEnd, idempotencyKey } = req.body;
    const sourceSite = assertSite(rawSite);
    if (!idempotencyKey || !user?.id || !user?.phone || !plan?.name || !subscriptionEnd) {
      throw httpError(400, 'Incomplete subscription preparation payload');
    }

    const response = await withTransaction(centralPool, async (client) => {
      const stored = await getStoredCommand(client, idempotencyKey);
      if (stored) return stored;
      const member = await upsertMember(client, user, sourceSite);
      const active = await client.query(
        `SELECT id FROM shared_subscriptions
         WHERE member_id = $1 AND status IN ('PENDING', 'ACTIVE')
         FOR UPDATE`,
        [member.id]
      );
      if (active.rowCount) {
        throw httpError(409, 'У клиента уже есть общий активный абонемент', 'SHARED_SUBSCRIPTION_EXISTS');
      }

      const created = await client.query(
        `INSERT INTO shared_subscriptions
          (member_id, origin_site, plan, visits_balance, subscription_end, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING *`,
        [member.id, sourceSite, plan, plan.visitsAmount ?? 0, subscriptionEnd]
      );
      const result = serializeSubscription(created.rows[0]);
      await saveCommand(client, { idempotencyKey, sourceSite, commandType: 'PREPARE_SUBSCRIPTION', response: result });
      return result;
    });

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/v1/subscriptions/confirm', async (req, res, next) => {
  try {
    const { sourceSite: rawSite, syncId, localSubscriptionId, idempotencyKey } = req.body;
    const sourceSite = assertSite(rawSite);
    if (!syncId || !localSubscriptionId || !idempotencyKey) {
      throw httpError(400, 'Incomplete subscription confirmation payload');
    }

    const response = await withTransaction(centralPool, async (client) => {
      const stored = await getStoredCommand(client, idempotencyKey);
      if (stored) return stored;
      const updated = await client.query(
        `UPDATE shared_subscriptions
         SET origin_local_subscription_id = $1, status = 'ACTIVE', version = GREATEST(version, 1),
             updated_at = NOW()
         WHERE id = $2 AND origin_site = $3 AND status IN ('PENDING', 'ACTIVE')
         RETURNING *`,
        [localSubscriptionId, syncId, sourceSite]
      );
      if (!updated.rowCount) throw httpError(404, 'Prepared subscription not found');
      const result = serializeSubscription(updated.rows[0]);
      await queueBothSites(client, 'SUBSCRIPTION', syncId, result.version);
      await queueBothSites(client, 'MEMBER', result.memberId, 0);
      await saveCommand(client, { idempotencyKey, sourceSite, commandType: 'CONFIRM_SUBSCRIPTION', response: result });
      return result;
    });
    queueWorker();
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/v1/subscriptions/:syncId/command', async (req, res, next) => {
  try {
    const { sourceSite: rawSite, type, idempotencyKey, actorLabel, ...payload } = req.body;
    const sourceSite = assertSite(rawSite);
    const syncId = req.params.syncId;
    if (!type || !idempotencyKey) throw httpError(400, 'Incomplete subscription command');

    const response = await withTransaction(centralPool, async (client) => {
      const stored = await getStoredCommand(client, idempotencyKey);
      if (stored) return stored;
      const selected = await client.query(
        'SELECT * FROM shared_subscriptions WHERE id = $1 FOR UPDATE',
        [syncId]
      );
      if (!selected.rowCount) throw httpError(404, 'Общий абонемент не найден');
      const current = selected.rows[0];
      const planLimit = current.plan.visitsAmount;
      let nextState = {
        visitsBalance: current.visits_balance,
        subscriptionEnd: current.subscription_end,
        frozenUntil: current.frozen_until,
        freezeStartedAt: current.freeze_started_at,
        freezeDaysUsed: current.freeze_days_used,
        freezeDaysReserved: current.freeze_days_reserved,
        freezeUntilManual: current.freeze_until_manual,
        status: current.status,
        plan: current.plan,
      };
      if (nextState.frozenUntil && new Date(nextState.frozenUntil) <= new Date()) {
        nextState = completeFreezePlan(nextState, new Date(nextState.frozenUntil));
      }
      let actionType = null;
      let details = {};

      if (type === 'ADJUST') {
        const balance = Number(payload.visitsBalance);
        if (!Number.isInteger(balance) || balance < 0 || (planLimit !== null && balance > planLimit)) {
          throw httpError(400, 'Некорректный баланс посещений');
        }
        nextState.visitsBalance = balance;
        if (balance === 0 && planLimit !== null) {
          nextState.status = 'EXPIRED';
          nextState.frozenUntil = null;
          nextState.freezeStartedAt = null;
          nextState.freezeDaysReserved = 0;
          nextState.freezeUntilManual = false;
        }
        actionType = 'VISITS_BALANCE_UPDATED';
        details = { previousVisitsBalance: current.visits_balance, nextVisitsBalance: balance };
      } else if (type === 'CANCEL') {
        if (current.status !== 'ACTIVE') throw httpError(400, 'Можно деактивировать только активный абонемент');
        nextState = {
          ...nextState,
          status: 'CANCELLED',
          visitsBalance: 0,
          frozenUntil: null,
          freezeStartedAt: null,
          freezeDaysReserved: 0,
          freezeUntilManual: false,
        };
        actionType = 'SUBSCRIPTION_CANCELLED';
        details = { previousVisitsBalance: current.visits_balance };
      } else if (type === 'ACTIVATE') {
        if (current.status === 'REFUNDED') throw httpError(400, 'Нельзя активировать возвращенный абонемент');
        if (new Date(current.subscription_end) <= new Date()) throw httpError(400, 'Срок абонемента истек');
        const balance = planLimit === null ? 0 : Number(payload.visitsBalance);
        if (planLimit !== null && (!Number.isInteger(balance) || balance < 1 || balance > planLimit)) {
          throw httpError(400, 'Некорректный баланс для активации');
        }
        nextState = {
          ...nextState,
          status: 'ACTIVE',
          visitsBalance: balance,
          frozenUntil: null,
          freezeStartedAt: null,
          freezeDaysReserved: 0,
          freezeUntilManual: false,
        };
        actionType = 'VISITS_BALANCE_UPDATED';
        details = { activatedSubscription: true, previousVisitsBalance: current.visits_balance, nextVisitsBalance: balance };
      } else if (type === 'FREEZE') {
        if (nextState.status !== 'ACTIVE') throw httpError(400, 'Нет активного абонемента для заморозки');
        if (nextState.frozenUntil && new Date(nextState.frozenUntil) > new Date()) {
          throw httpError(400, 'Абонемент уже заморожен');
        }
        try {
          const legacyDays = payload.details?.daysAdded
            || (
              payload.frozenUntil && payload.details?.freezeFrom
                ? Math.ceil(
                    (new Date(payload.frozenUntil) - new Date(payload.details.freezeFrom))
                    / (24 * 60 * 60 * 1000)
                  )
                : undefined
            );
          nextState = createFreezePlan(nextState, {
            mode: payload.mode || 'FIXED',
            days: payload.days || legacyDays,
          });
        } catch (error) {
          throw httpError(400, error.message);
        }
        actionType = 'SUBSCRIPTION_FROZEN';
        details = {
          ...(payload.details || {}),
          frozenUntil: nextState.frozenUntil.toISOString(),
        };
      } else if (type === 'UNFREEZE') {
        if (!nextState.frozenUntil || new Date(nextState.frozenUntil) <= new Date()) {
          throw httpError(400, 'Абонемент не заморожен');
        }
        nextState = completeFreezePlan(nextState);
        actionType = 'SUBSCRIPTION_UNFROZEN';
        details = {
          ...(payload.details || {}),
          daysUsed: nextState.lastFreezeDaysUsed,
          daysRestored: nextState.lastFreezeDaysRestored,
        };
      } else if (type === 'REFUND') {
        const visits = await client.query(
          'SELECT 1 FROM shared_visits WHERE subscription_id = $1 LIMIT 1',
          [syncId]
        );
        if (visits.rowCount) {
          throw httpError(400, 'Возврат невозможен: по абонементу уже были посещения');
        }
        nextState = {
          ...nextState,
          status: 'REFUNDED',
          visitsBalance: 0,
          frozenUntil: null,
          freezeStartedAt: null,
          freezeDaysReserved: 0,
          freezeUntilManual: false,
        };
        actionType = 'SALE_REFUNDED';
        details = payload.details || {};
      } else if (type === 'UPDATE') {
        const planChanged = payload.plan && !plansEqual(payload.plan, current.plan);
        if (planChanged) {
          const visits = await client.query(
            'SELECT 1 FROM shared_visits WHERE subscription_id = $1 LIMIT 1',
            [syncId]
          );
          if (visits.rowCount) {
            throw httpError(400, 'Нельзя менять тариф после первого посещения по абонементу');
          }
        }
        nextState.plan = payload.plan || current.plan;
        nextState.subscriptionEnd = payload.subscriptionEnd || current.subscription_end;
        if (payload.visitsBalance !== undefined) nextState.visitsBalance = payload.visitsBalance;
      } else {
        throw httpError(400, 'Unknown subscription command');
      }

      const updated = await client.query(
        `UPDATE shared_subscriptions
         SET plan = $1, visits_balance = $2, subscription_end = $3, frozen_until = $4,
             freeze_started_at = $5, freeze_days_used = $6, freeze_days_reserved = $7,
             freeze_until_manual = $8, status = $9, version = version + 1, updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          nextState.plan,
          nextState.visitsBalance,
          nextState.subscriptionEnd,
          nextState.frozenUntil,
          nextState.freezeStartedAt,
          nextState.freezeDaysUsed,
          nextState.freezeDaysReserved,
          nextState.freezeUntilManual,
          nextState.status,
          syncId,
        ]
      );
      const result = {
        ...serializeSubscription(updated.rows[0]),
        ...(type === 'UNFREEZE' && {
          lastFreezeDaysUsed: nextState.lastFreezeDaysUsed || 0,
          lastFreezeDaysRestored: nextState.lastFreezeDaysRestored || 0,
        }),
      };
      await queueBothSites(client, 'SUBSCRIPTION', syncId, result.version);
      if (actionType) {
        const action = await client.query(
          `INSERT INTO shared_actions
            (subscription_id, source_site, actor_label, action_type, details)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [syncId, sourceSite, actorLabel || null, actionType, details]
        );
        await queueOppositeSite(client, 'ACTION', action.rows[0].id, sourceSite);
      }
      await saveCommand(client, { idempotencyKey, sourceSite, commandType: type, response: result });
      return result;
    });
    queueWorker();
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/v1/checkins', async (req, res, next) => {
  try {
    const {
      sourceSite: rawSite,
      syncId,
      visitsDeducted,
      guestCount = 0,
      confirmDuplicate = false,
      idempotencyKey,
      actorLabel,
      isAdminAction = false,
    } = req.body;
    const sourceSite = assertSite(rawSite);
    if (!syncId || !idempotencyKey || !Number.isInteger(visitsDeducted) || visitsDeducted < 1) {
      throw httpError(400, 'Incomplete check-in command');
    }

    const response = await withTransaction(centralPool, async (client) => {
      const stored = await getStoredCommand(client, idempotencyKey);
      if (stored) return stored;
      const selected = await client.query(
        'SELECT * FROM shared_subscriptions WHERE id = $1 FOR UPDATE',
        [syncId]
      );
      if (!selected.rowCount) throw httpError(404, 'Общий абонемент не найден');
      const subscription = selected.rows[0];
      let subscriptionState = {
        subscriptionEnd: subscription.subscription_end,
        frozenUntil: subscription.frozen_until,
        freezeStartedAt: subscription.freeze_started_at,
        freezeDaysUsed: subscription.freeze_days_used,
        freezeDaysReserved: subscription.freeze_days_reserved,
        freezeUntilManual: subscription.freeze_until_manual,
      };
      if (subscriptionState.frozenUntil && new Date(subscriptionState.frozenUntil) <= new Date()) {
        subscriptionState = completeFreezePlan(
          subscriptionState,
          new Date(subscriptionState.frozenUntil)
        );
      }
      if (subscription.status !== 'ACTIVE') throw httpError(400, 'Нет активного абонемента');
      if (new Date(subscriptionState.subscriptionEnd) <= new Date()) throw httpError(400, 'Срок абонемента истек');
      if (subscriptionState.frozenUntil && new Date(subscriptionState.frozenUntil) > new Date()) {
        throw httpError(400, 'Абонемент заморожен');
      }

      const lastVisit = await client.query(
        `SELECT created_at FROM shared_visits
         WHERE subscription_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [syncId]
      );
      if (lastVisit.rowCount && !confirmDuplicate) {
        const elapsed = Date.now() - new Date(lastVisit.rows[0].created_at).getTime();
        if (elapsed >= 0 && elapsed <= 12 * 60 * 60 * 1000) {
          throw httpError(409, 'Недавнее посещение требует подтверждения', 'DUPLICATE_CHECKIN_CONFIRMATION_REQUIRED');
        }
      }

      const unlimited = subscription.plan.visitsAmount === null;
      if (unlimited && guestCount > 0) throw httpError(400, 'Безлимитный абонемент не позволяет приглашать гостей');
      if (!unlimited && subscription.visits_balance < visitsDeducted) {
        throw httpError(400, 'Недостаточно посещений на балансе');
      }

      const nextBalance = unlimited ? 0 : subscription.visits_balance - visitsDeducted;
      const nextStatus = !unlimited && nextBalance <= 0 ? 'EXPIRED' : subscription.status;
      const updated = await client.query(
        `UPDATE shared_subscriptions
         SET visits_balance = $1, status = $2,
             subscription_end = $3,
             frozen_until = CASE WHEN $2 = 'EXPIRED' THEN NULL::timestamptz ELSE $4::timestamptz END,
             freeze_started_at = CASE WHEN $2 = 'EXPIRED' THEN NULL::timestamptz ELSE $5::timestamptz END,
             freeze_days_used = $6,
             freeze_days_reserved = CASE WHEN $2 = 'EXPIRED' THEN 0 ELSE $7 END,
             freeze_until_manual = CASE WHEN $2 = 'EXPIRED' THEN false ELSE $8 END,
             version = version + 1, updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          nextBalance,
          nextStatus,
          subscriptionState.subscriptionEnd,
          subscriptionState.frozenUntil,
          subscriptionState.freezeStartedAt,
          subscriptionState.freezeDaysUsed,
          subscriptionState.freezeDaysReserved,
          subscriptionState.freezeUntilManual,
          syncId,
        ]
      );
      const visit = await client.query(
        `INSERT INTO shared_visits
          (subscription_id, source_site, visits_deducted, guest_count, actor_label,
           is_admin_action, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [syncId, sourceSite, visitsDeducted, guestCount, actorLabel || null, isAdminAction, idempotencyKey]
      );
      const result = {
        subscription: serializeSubscription(updated.rows[0]),
        visit: {
          syncId: visit.rows[0].id,
          sourceSite,
          visitsDeducted,
          guestCount,
          createdAt: visit.rows[0].created_at,
        },
      };
      await queueBothSites(client, 'SUBSCRIPTION', syncId, result.subscription.version);
      await queueBothSites(client, 'VISIT', visit.rows[0].id, 0);
      if (isAdminAction) {
        const action = await client.query(
          `INSERT INTO shared_actions
            (subscription_id, source_site, actor_label, action_type, details)
           VALUES ($1, $2, $3, 'ADMIN_VISIT_CHECKIN', $4)
           RETURNING id`,
          [syncId, sourceSite, actorLabel || null, { visitsDeducted }]
        );
        await queueOppositeSite(client, 'ACTION', action.rows[0].id, sourceSite);
      }
      await saveCommand(client, { idempotencyKey, sourceSite, commandType: 'CHECKIN', response: result });
      return result;
    });
    queueWorker();
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (!error.statusCode || error.statusCode >= 500) {
    console.error('[sync]', error);
  }
  res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : 'Sync service error',
    ...(error.code && { code: error.code }),
  });
});

await ensureCentralSchema();

const server = app.listen(config.port, () => {
  console.log(`[sync] listening on ${config.port}`);
});

const projectionTimer = setInterval(() => processProjectionJobs().catch((error) => console.error('[projection]', error)), config.projectionIntervalMs);
const reconciliationTimer = setInterval(() => reconcileAll().catch((error) => console.error('[reconcile]', error)), config.reconciliationIntervalMs);

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(projectionTimer);
  clearInterval(reconciliationTimer);
  await new Promise((resolve) => server.close(resolve));
  await waitForProjectionWorker();
  await closePools();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
