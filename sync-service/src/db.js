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
