import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/index.js';
import { seedCore } from '../src/db/seed-core.js';

const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

async function main(): Promise<void> {
  console.log('Seeding database:', config.databaseUrl.replace(/:[^:@/]+@/, ':****@'));

  const adminEmail = config.admin.email.trim().toLowerCase();
  if (!adminEmail || !config.admin.password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin account');
  }
  if (config.isProd && config.admin.password === 'ChangeMe_Admin123!') {
    throw new Error('Refusing to seed the insecure default admin password in production — set a strong ADMIN_PASSWORD');
  }

  const result = await seedCore(prisma, {
    adminEmail,
    adminPassword: config.admin.password,
    adminName: config.admin.name,
    eventName: config.eventName,
  });

  console.log(`✓ Admin user ready: ${result.adminEmail}`);
  console.log(result.eventCreated ? `✓ Event created: ${config.eventName}` : '✓ Event already exists');
  console.log(`✓ Seeded ${result.challengeCount} challenges (12 standard + hidden + final-boss)`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
