#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Seeding database..."
node prisma/seed.js

echo "[entrypoint] Starting server..."
exec node src/index.js
