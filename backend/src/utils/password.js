import bcrypt from 'bcryptjs';

const PASSWORD_HASH_ROUNDS = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') {
    return Promise.resolve(false);
  }
  return bcrypt.compare(password, passwordHash);
}
