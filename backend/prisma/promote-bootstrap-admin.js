import '../src/config/loadEnv.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.ADMIN_PHONE?.trim();
  if (!phone) {
    throw new Error('ADMIN_PHONE is required');
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error('Bootstrap administrator was not found');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'SUPER_ADMIN', isVerified: true, isActive: true },
  });
  console.log('Bootstrap administrator promoted to SUPER_ADMIN');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
