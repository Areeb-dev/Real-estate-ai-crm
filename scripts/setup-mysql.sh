#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting MySQL with Docker Compose..."
docker compose up -d

echo "Waiting for MySQL health..."
for i in {1..30}; do
  if docker exec real-estate-mysql mysqladmin ping -h localhost -uroot -prootpassword --silent; then
    break
  fi
  sleep 2
done

echo "Pushing Prisma schema..."
npm run db:push

echo "Seeding database..."
npm run db:seed

echo "Done. Start the app with: npm run dev"
