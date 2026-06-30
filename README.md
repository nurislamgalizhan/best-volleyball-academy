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
- для сервера с несколькими сайтами: `APP_HOST=127.0.0.1`, `APP_PORT=8081`

Файлов `backend/.env` и `frontend/.env` в Docker-сценарии быть не должно.

### 2. Запуск через Docker
```bash
docker compose up -d --build
```

Backend при старте сам применяет Prisma migrations и seed через `backend/entrypoint.sh`.

### 3. Проверка
```bash
docker compose ps
docker compose logs backend --tail=100
```

## Учётные данные администратора
- Телефон задается через `ADMIN_PHONE`
- Пароль задается через `ADMIN_PASSWORD`

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
| GET | /api/users | Admin | Список клиентов |
| GET | /api/users/:id | Admin | Карточка клиента |
| POST | /api/users | Admin | Создать клиента |
| PATCH | /api/users/:id/adjust | Admin | Корректировка баланса |
| DELETE | /api/users/:id | Admin | Деактивация |
| GET | /api/tariffs | JWT | Тарифы |
| POST | /api/tariffs | Admin | Создать тариф |
| PATCH | /api/tariffs/:id | Admin | Обновить тариф |
| DELETE | /api/tariffs/:id | Admin | Деактивировать тариф |
| POST | /api/visits/checkin | JWT | Списание посещений |
| GET | /api/visits | Admin | Лог посещений |
| POST | /api/sales | Admin | Продать абонемент |
| GET | /api/sales | Admin | Лог продаж |
