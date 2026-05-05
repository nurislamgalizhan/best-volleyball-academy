# Меркурий Медет — CRM для фитнес-студии

## Быстрый старт

### 1. База данных
```bash
# Создайте PostgreSQL базу данных
createdb mercury_medet
```

### 2. Бэкенд
```bash
cd backend
npm install
cp .env.example .env
# Отредактируйте .env — укажите DATABASE_URL

npx prisma migrate dev --name init
npx prisma generate
node prisma/seed.js   # Создаёт admin + тарифы

npm run dev           # http://localhost:4000
```

### 3. Фронтенд
```bash
cd frontend
npm install
npm run dev           # http://localhost:5173
```

## Учётные данные администратора (seed)
- Телефон: `77000000000`
- Пароль: ``

## Стек
- **Backend:** Node.js + Express + Prisma (PostgreSQL) + Socket.io + Zod
- **Frontend:** React (Vite) + Tailwind CSS + React Router + Axios
- **Auth:** JWT + WhatsApp верификация (Green API)

## API Endpoints

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| POST | /api/auth/register | — | Регистрация |
| POST | /api/auth/verify | — | Верификация кода |
| POST | /api/auth/resend-code | — | Повтор кода |
| POST | /api/auth/login | — | Вход |
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
