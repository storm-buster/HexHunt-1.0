import { prisma } from '../db/prisma.js';
import { verifySecret } from '../auth/password.js';

// Portal mini-puzzles are pure UX detours with no scoring impact, but their
// answers still must not live in the client bundle. We validate them
// server-side against a stored argon2 hash.
export async function checkPortalAnswer(challengeId: string, answer: string): Promise<boolean> {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { portalAnswerHash: true },
  });
  if (!challenge?.portalAnswerHash) return false;
  return verifySecret(challenge.portalAnswerHash, answer);
}
