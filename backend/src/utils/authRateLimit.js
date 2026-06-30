const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map();

function getKey(ip, identifier) {
  return `${ip || 'unknown'}:${identifier || 'unknown'}`;
}

function getRecord(key) {
  const current = attempts.get(key);
  if (!current) return { count: 0, expiresAt: 0 };

  if (current.expiresAt < Date.now()) {
    attempts.delete(key);
    return { count: 0, expiresAt: 0 };
  }

  return current;
}

export function getRateLimitState(ip, identifier) {
  const key = getKey(ip, identifier);
  const current = getRecord(key);

  if (current.count < MAX_ATTEMPTS) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - Date.now()) / 1000)),
  };
}

export function registerFailedAttempt(ip, identifier) {
  const key = getKey(ip, identifier);
  const current = getRecord(key);

  attempts.set(key, {
    count: current.count + 1,
    expiresAt: Date.now() + WINDOW_MS,
  });
}

export function clearFailedAttempts(ip, identifier) {
  attempts.delete(getKey(ip, identifier));
}
