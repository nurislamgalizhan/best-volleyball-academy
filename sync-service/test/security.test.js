import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';
process.env.MERCURY_DATABASE_URL ||= 'postgresql://test:test@localhost/mercury';
process.env.BVA_DATABASE_URL ||= 'postgresql://test:test@localhost/bva';
process.env.SYNC_HMAC_SECRET ||= 'test-secret-at-least-thirty-two-characters';

const { signatureFor, stableStringify, verifyHmac } = await import('../src/security.js');

test('stableStringify signs objects independently of key order', () => {
  assert.equal(
    stableStringify({ z: 1, nested: { b: 2, a: 3 } }),
    stableStringify({ nested: { a: 3, b: 2 }, z: 1 })
  );
});

test('verifyHmac accepts a fresh valid signature', () => {
  const timestamp = String(Date.now());
  const body = { sourceSite: 'BVA', visitsDeducted: 1 };
  const signature = signatureFor({
    timestamp,
    method: 'POST',
    path: '/v1/checkins',
    body,
  });
  const req = {
    method: 'POST',
    originalUrl: '/v1/checkins',
    body,
    get(name) {
      return name === 'x-sync-timestamp' ? timestamp : signature;
    },
  };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {},
  };
  let called = false;
  verifyHmac(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(statusCode, null);
});

test('verifyHmac rejects expired timestamps', () => {
  const req = {
    method: 'GET',
    originalUrl: '/v1/status',
    body: undefined,
    get(name) {
      return name === 'x-sync-timestamp' ? String(Date.now() - 31_000) : '00';
    },
  };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {},
  };
  verifyHmac(req, res, () => assert.fail('next must not be called'));
  assert.equal(statusCode, 401);
});
