import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const centralPool = new Pool({ connectionString: config.databaseUrl, max: 10 });
export const mercuryPool = new Pool({ connectionString: config.mercuryDatabaseUrl, max: 5 });
export const bvaPool = new Pool({ connectionString: config.bvaDatabaseUrl, max: 5 });

export const sitePools = {
  MERCURY: mercuryPool,
  BVA: bvaPool,
};

export async function ensureCentralSchema() {
  await centralPool.query(`
    ALTER TABLE shared_subscriptions
      ADD COLUMN IF NOT EXISTS freeze_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS freeze_days_used INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS freeze_days_reserved INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS freeze_until_manual BOOLEAN NOT NULL DEFAULT false
  `);
}

export async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePools() {
  await Promise.all([centralPool.end(), mercuryPool.end(), bvaPool.end()]);
}
