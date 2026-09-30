// ============================================================
// Admin provisioning / password reset  (npm run admin:reset)
// ------------------------------------------------------------
// Deterministic, safe, idempotent. Reads ADMIN_EMAIL / ADMIN_PASSWORD from the
// environment (never hardcoded). Finds or creates the admin, sets the password
// hash correctly, forces role = ADMIN + active, and verifies the hash.
//
// The password is NEVER printed to logs.
// ============================================================
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/index.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

async function main(): Promise<void> {
  const email = config.admin.email.trim().toLowerCase();
  const password = config.admin.password;
  const name = config.admin.name;

  if (!email) throw new Error('ADMIN_EMAIL is not set in the environment (.env)');
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD is missing or too short (min 8 chars). Set it in .env');
  }
  if (config.isProd && password === 'ChangeMe_Admin123!') {
    throw new Error('Refusing to set the insecure default admin password in production — set a strong ADMIN_PASSWORD');
  }
  if (config.isProd && password === 'ChangeMe_Admin123!') {
    throw new Error('Refusing to set the insecure default admin password in production — set a strong ADMIN_PASSWORD');
  }

  // 1. Verify database connectivity.
  await prisma.$connect();
  console.log(`Connected to database: ${config.databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);

  // 2. Find/create the admin and set the password hash + role atomically.
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', active: true, name },
    create: { email, name, passwordHash, role: 'ADMIN' },
  });

  // 3. Confirm the stored hash verifies against the intended password.
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new Error('Post-write verification failed — password hash did not verify');
  if (user.role !== 'ADMIN') throw new Error('Admin role was not applied');

  // 4. Confirm completion (never print the password).
  console.log(
    `${existing ? 'Admin password reset' : 'Admin account created'} successfully for ${email}`,
  );
  console.log('Role: ADMIN · active: true · password hash verified ✓');
}

main()
  .catch((e) => {
    console.error('admin:reset failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
