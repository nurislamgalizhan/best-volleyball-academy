import crypto from 'node:crypto';
import { config } from './config.js';

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function signatureFor({ timestamp, method, path, body, secret = config.hmacSecret }) {
  const payload = `${timestamp}.${method.toUpperCase()}.${path}.${stableStringify(body ?? {})}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyHmac(req, res, next) {
  const timestamp = req.get('x-sync-timestamp');
  const signature = req.get('x-sync-signature');
  const timestampMs = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 30000) {
    return res.status(401).json({ message: 'Invalid sync authentication timestamp' });
  }

  const expected = signatureFor({
    timestamp,
    method: req.method,
    path: req.originalUrl,
    body: req.body,
  });
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(401).json({ message: 'Invalid sync signature' });
  }
  next();
}
