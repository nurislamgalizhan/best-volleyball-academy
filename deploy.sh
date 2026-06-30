#!/bin/bash
# ============================================================
# Best Volleyball Academy CRM — Deploy Script
# ============================================================
set -e

echo "🚀 Best Volleyball Academy — Деплой"

# 1. Проверка .env
if [ ! -f ".env" ]; then
  echo "❌ Файл .env не найден!"
  echo "   Выполните: cp .env.example .env  и заполните переменные"
  exit 1
fi

if [ -f "backend/.env" ]; then
  echo "❌ Найден лишний backend/.env"
  echo "   В Docker-сценарии используется только корневой .env. Удалите backend/.env."
  exit 1
fi

# 2. Проверка обязательных переменных
source .env
MISSING=()
[ -z "$JWT_SECRET" ]        && MISSING+=("JWT_SECRET")
[ -z "$ADMIN_PHONE" ]       && MISSING+=("ADMIN_PHONE")
[ -z "$ADMIN_PASSWORD" ]    && MISSING+=("ADMIN_PASSWORD")
[ -z "$DB_PASSWORD" ]       && MISSING+=("DB_PASSWORD")
[ -z "$GREEN_API_ID_INSTANCE" ]    && MISSING+=("GREEN_API_ID_INSTANCE")
[ -z "$GREEN_API_TOKEN_INSTANCE" ] && MISSING+=("GREEN_API_TOKEN_INSTANCE")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Не заполнены обязательные переменные в .env:"
  for v in "${MISSING[@]}"; do echo "   - $v"; done
  exit 1
fi

if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "❌ JWT_SECRET слишком короткий (минимум 32 символа)"
  echo "   Сгенерируйте: openssl rand -hex 32"
  exit 1
fi

echo "✅ Переменные окружения — OK"

# 3. Сборка и запуск
echo "🔨 Сборка Docker образов..."
docker compose build --no-cache

echo "🗄️  Запуск контейнеров..."
docker compose up -d

echo "⏳ Ожидание запуска БД..."
sleep 10

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "   Приложение доступно локально: ${APP_HOST:-127.0.0.1}:${APP_PORT:-8081}"
echo "   Логи backend:  docker compose logs -f backend"
echo "   Логи frontend: docker compose logs -f frontend"
echo ""
echo "   Остановить:    docker compose down"
echo "   Перезапустить: docker compose restart"
