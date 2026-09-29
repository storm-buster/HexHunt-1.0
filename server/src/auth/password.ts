import { hash, verify } from '@node-rs/argon2';

// Argon2id parameters (OWASP-recommended baseline).
const OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

// Flags/answers are hashed with the same password-resistant KDF so a database
// leak does not reveal competition answers.
export function hashSecret(plain: string): Promise<string> {
  return hash(normalizeFlag(plain), OPTS);
}

export async function verifySecret(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, normalizeFlag(plain));
  } catch {
    return false;
  }
}

// Canonical normalization applied to both stored and submitted flags:
// trim outer whitespace and compare case-insensitively (matches the original
// client behaviour which upper-cased both sides).
export function normalizeFlag(flag: string): string {
  return flag.trim().toUpperCase();
}
