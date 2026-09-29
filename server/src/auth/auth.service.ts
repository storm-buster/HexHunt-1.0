import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './password.js';
import { Errors } from '../middleware/errors.js';
import type { SessionPayload } from './guards.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'PLAYER' | 'ADMIN';
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function toPublicUser(u: {
  id: string;
  name: string;
  email: string;
  role: 'PLAYER' | 'ADMIN';
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Errors.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, passwordHash, role: 'PLAYER' },
  });
  return toPublicUser(user);
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser; payload: SessionPayload }> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-ish response regardless of which factor failed (no user enumeration).
  if (!user || !user.active) {
    // Still perform a hash verify against a dummy to reduce timing signal.
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3g2Z0m2m2m2m2m2m2m2m2A',
      input.password,
    ).catch(() => false);
    throw Errors.unauthorized('Invalid email or password');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw Errors.unauthorized('Invalid email or password');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    user: toPublicUser(user),
    payload: { sub: user.id, role: user.role, email: user.email },
  };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}
