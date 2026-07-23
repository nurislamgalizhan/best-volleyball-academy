# Best Volleyball Academy — CRM

## Быстрый старт

### 1. Настройка окружения
```bash
cp .env.example .env
```

Заполните **только корневой** `.env`:
- `COMPOSE_PROJECT_NAME=best-volleyball-academy`
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `ADMIN_PHONE`, `ADMIN_PASSWORD`
- `GREEN_API_ID_INSTANCE`, `GREEN_API_TOKEN_INSTANCE`
- `FRONTEND_URL`, `APP_PORT`
- для общей секции: `SYNC_HMAC_SECRET`, `SYNC_DB_*`, `SYNC_MERCURY_DATABASE_URL`, `SYNC_BVA_DATABASE_URL`
- для сервера с несколькими сайтами: `APP_HOST=127.0.0.1`, `APP_PORT=8081`

Файлов `backend/.env` и `frontend/.env` в Docker-сценарии быть не должно.

### 2. Запуск через Docker
```bash
docker compose up -d --build
```

Backend при старте сам применяет Prisma migrations и seed через `backend/entrypoint.sh`.

На сервере, где `mmedet.kz` уже занимает `80/443`, используйте дополнительный override:

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

### 3. Проверка
```bash
docker compose ps
docker compose logs backend --tail=100
```

## Учётные данные администратора
- Телефон задается через `ADMIN_PHONE`
- Пароль задается через `ADMIN_PASSWORD`
- Первый администратор имеет роль `SUPER_ADMIN`; повторный seed не меняет его пароль и роль.

## Роли BVA

- `SUPER_ADMIN`: весь функционал, бухгалтерия, общая выручка, экспорт, история изменений и управление администраторами.
- `ADMIN`: клиенты, абонементы, посещения, продажи, возвраты, секции и тарифы.
- `VISITOR`: клиентский кабинет.

Backend читает актуальную роль из базы на каждом запросе. После снятия роли старый JWT больше не дает административный доступ.

## Синхронизация волейбола

Центральный `volleyball-sync` не публикует порт наружу и подключается только к Docker-сетям Mercury и BVA. Продажи остаются в исходной бухгалтерии, а общий абонемент и посещения проецируются в обе локальные базы.

```bash
# Запуск приватного сервиса (используется тот же корневой .env)
docker compose -f docker-compose.sync.yml up -d --build

# Безопасный предварительный отчет, без изменения данных
docker compose -f docker-compose.sync.yml run --rm sync node src/backfill.js

# Идемпотентный первичный перенос
docker compose -f docker-compose.sync.yml run --rm sync node src/backfill.js --apply
```

Перед `--apply` обязательны полные `pg_dump` обеих баз. Сначала разверните additive-миграции с `VOLLEYBALL_SYNC_ENABLED=false`, выполните dry-run и перенос, затем включите BVA и только после проверки Mercury.

## Auth
- Телефон + пароль
- Коды подтверждения в WhatsApp через Green API
- Admin MFA тоже использует WhatsApp-код через Green API

## API Endpoints

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | /api/auth/register | — | Регистрация по телефону |
| POST | /api/auth/verify | — | Подтверждение WhatsApp-кода |
| POST | /api/auth/resend-code | — | Повтор кода |
| POST | /api/auth/login | — | Вход по телефону и паролю |
| POST | /api/auth/forgot-password | — | Отправка кода сброса пароля |
| POST | /api/auth/reset-password | — | Сброс пароля |
| GET | /api/auth/me | JWT | Текущий пользователь |
| GET | /api/users | Staff | Список клиентов |
| GET | /api/users/:id | Staff | Карточка клиента |
| POST | /api/users | Staff | Создать клиента |
| PATCH | /api/users/:id/adjust | Staff | Корректировка баланса |
| DELETE | /api/users/:id | Staff | Деактивация |
| GET | /api/tariffs | JWT | Тарифы |
| POST | /api/tariffs | Staff | Создать тариф |
| PATCH | /api/tariffs/:id | Staff | Обновить тариф |
| DELETE | /api/tariffs/:id | Staff | Деактивировать тариф |
| POST | /api/visits/checkin | JWT | Списание посещений |
| GET | /api/visits | Staff | Лог посещений |
| POST | /api/sales | Staff | Продать абонемент |
| GET | /api/sales | Super Admin | Бухгалтерия и лог продаж |
| GET | /api/users/admin-history | Super Admin | История изменений |
| GET | /api/admins | Super Admin | Список администраторов |
| POST | /api/admins | Super Admin | Создать администратора |
| POST | /api/admins/:id/promote | Super Admin | Назначить администратора |
| POST | /api/admins/:id/demote | Super Admin | Снять роль администратора |
| GET | /api/sync/status | Staff | Состояние синхронизации |
