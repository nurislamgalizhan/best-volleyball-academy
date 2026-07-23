import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4100),
  databaseUrl: required('DATABASE_URL'),
  mercuryDatabaseUrl: required('MERCURY_DATABASE_URL'),
  bvaDatabaseUrl: required('BVA_DATABASE_URL'),
  hmacSecret: required('SYNC_HMAC_SECRET'),
  mercurySectionName: process.env.MERCURY_SECTION_NAME?.trim() || 'Волейбол',
  bvaSectionName: process.env.BVA_SECTION_NAME?.trim() || 'Волейбол (Коперника 130)',
  projectionIntervalMs: Number(process.env.PROJECTION_INTERVAL_MS || 1000),
  reconciliationIntervalMs: Number(process.env.RECONCILIATION_INTERVAL_MS || 60000),
};

export const siteConfig = {
  MERCURY: {
    sectionName: config.mercurySectionName,
    label: 'Меркурий Медет',
  },
  BVA: {
    sectionName: config.bvaSectionName,
    label: 'BVA, Коперника 130',
  },
};

export function assertSite(site) {
  if (site !== 'MERCURY' && site !== 'BVA') {
    const error = new Error('Unknown sync site');
    error.statusCode = 400;
    throw error;
  }
  return site;
}

export function oppositeSite(site) {
  return site === 'MERCURY' ? 'BVA' : 'MERCURY';
}
