import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`❌ Обязательная переменная окружения не задана: ${name}`);
    console.error('   Заполните .env файл перед запуском seed.');
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  const phone     = requireEnv('ADMIN_PHONE');
  const password  = requireEnv('ADMIN_PASSWORD');
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Администратор';
  const lastName  = process.env.ADMIN_LAST_NAME?.trim()  || 'Системы';

  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD должен быть минимум 8 символов');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where:  { phone },
    update: { passwordHash, role: 'ADMIN', isVerified: true },
    create: { firstName, lastName, phone, passwordHash, role: 'ADMIN', isVerified: true },
  });

  console.log('✅ Admin:', admin.phone);

  const tariffs = [
    { name: 'Утренний — 8 посещений',  visitsAmount: 8,    durationDays: 30, price: 12000, timeType: 'MORNING', timeStart: '07:00', timeEnd: '14:00' },
    { name: 'Утренний — 12 посещений', visitsAmount: 12,   durationDays: 30, price: 16000, timeType: 'MORNING', timeStart: '07:00', timeEnd: '14:00' },
    { name: 'Вечерний — 8 посещений',  visitsAmount: 8,    durationDays: 30, price: 14000, timeType: 'EVENING', timeStart: '17:00', timeEnd: '22:00' },
    { name: 'Вечерний — 12 посещений', visitsAmount: 12,   durationDays: 30, price: 18000, timeType: 'EVENING', timeStart: '17:00', timeEnd: '22:00' },
    { name: 'Безлимит — Любое время',  visitsAmount: null, durationDays: 30, price: 25000, timeType: 'ANY' },
    { name: 'Разовое посещение',       visitsAmount: 1,    durationDays: 1,  price: 2500,  timeType: 'ANY' },
  ];

  for (const t of tariffs) {
    const existing = await prisma.tariff.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.tariff.create({ data: t });
    }
  }
  console.log('✅ Тарифы готовы');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
