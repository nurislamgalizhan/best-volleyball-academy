import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/utils/phone.js';
import { getDuplicateVisitWarning } from '../src/utils/visits.js';
import {
  clearFailedAttempts,
  getRateLimitState,
  registerFailedAttempt,
} from '../src/utils/authRateLimit.js';

test('normalizePhone normalizes local and international formats', () => {
  assert.equal(normalizePhone('7771234567'), '77771234567');
  assert.equal(normalizePhone('+7 (775) 232-22-94'), '77752322294');
  assert.equal(normalizePhone('8 (775) 232-22-94'), '77752322294');
});

test('getDuplicateVisitWarning returns human-readable minutes and hours', () => {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);

  assert.match(getDuplicateVisitWarning(fifteenMinutesAgo), /15 минут/);
  assert.match(getDuplicateVisitWarning(threeHoursAgo), /3 часа/);
  assert.equal(getDuplicateVisitWarning(thirteenHoursAgo), null);
});

test('auth rate limiter blocks after too many attempts and can be reset', () => {
  const ip = '127.0.0.1';
  const phone = '77752322294';
  clearFailedAttempts(ip, phone);

  for (let index = 0; index < 10; index += 1) {
    registerFailedAttempt(ip, phone);
  }

  const blockedState = getRateLimitState(ip, phone);
  assert.equal(blockedState.blocked, true);
  assert.ok(blockedState.retryAfterSeconds > 0);

  clearFailedAttempts(ip, phone);
  assert.equal(getRateLimitState(ip, phone).blocked, false);
});
