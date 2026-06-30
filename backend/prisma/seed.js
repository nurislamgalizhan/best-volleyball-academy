import '../src/config/loadEnv.js';
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

  const defaultSection = await prisma.section.upsert({
    where: { name: 'Тренажерный зал' },
    update: { isActive: true, sortOrder: 0 },
    create: { name: 'Тренажерный зал', sortOrder: 0 },
  });

  await prisma.tariff.updateMany({
    where: { name: 'Утренний — 8 посещений' },
    data: { name: 'Дневной — 8 посещений', sectionId: defaultSection.id },
  });
  await prisma.tariff.updateMany({
    where: { name: 'Утренний — 12 посещений' },
    data: { name: 'Дневной — 12 посещений', sectionId: defaultSection.id },
  });

  const tariffs = [
    { sectionId: defaultSection.id, name: 'Дневной — 8 посещений',   visitsAmount: 8,    durationDays: 30, price: 12000, timeType: 'MORNING', timeStart: '07:00', timeEnd: '14:00' },
    { sectionId: defaultSection.id, name: 'Дневной — 12 посещений',  visitsAmount: 12,   durationDays: 30, price: 16000, timeType: 'MORNING', timeStart: '07:00', timeEnd: '14:00' },
    { sectionId: defaultSection.id, name: 'Вечерний — 8 посещений',  visitsAmount: 8,    durationDays: 30, price: 14000, timeType: 'EVENING', timeStart: '17:00', timeEnd: '22:00' },
    { sectionId: defaultSection.id, name: 'Вечерний — 12 посещений', visitsAmount: 12,   durationDays: 30, price: 18000, timeType: 'EVENING', timeStart: '17:00', timeEnd: '22:00' },
    { sectionId: defaultSection.id, name: 'Безлимит — Любое время',  visitsAmount: null, durationDays: 30, price: 25000, timeType: 'ANY' },
    { sectionId: defaultSection.id, name: 'Разовое посещение',       visitsAmount: 1,    durationDays: 1,  price: 2500,  timeType: 'ANY' },
  ];

  for (const t of tariffs) {
    const existing = await prisma.tariff.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.tariff.create({ data: t });
    } else if (!existing.sectionId) {
      await prisma.tariff.update({ where: { id: existing.id }, data: { sectionId: defaultSection.id } });
    }
  }
  console.log('✅ Тарифы готовы');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
