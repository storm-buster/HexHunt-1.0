import { config } from '../config/index.js';

export interface ScoringPolicy {
  decayStepMinutes: number;
  decayStepPercent: number;
  floorPercent: number;
}

export function currentPolicy(): ScoringPolicy {
  return {
    decayStepMinutes: config.scoring.decayStepMinutes,
    decayStepPercent: config.scoring.decayStepPercent,
    floorPercent: config.scoring.floorPercent,
  };
}

/**
 * Time-decay scoring.
 *
 *   steps       = floor(elapsedSeconds / (decayStepMinutes * 60))
 *   multiplier  = max(1 - (decayStepPercent/100) * steps, floorPercent/100)
 *   awarded     = floor(basePoints * multiplier)
 *
 * Elapsed time is measured from the server's event start time — never the
 * client clock. The policy is fully configurable via environment variables.
 */
export function computeAwardedPoints(
  basePoints: number,
  elapsedSeconds: number,
  policy: ScoringPolicy = currentPolicy(),
): number {
  const safeElapsed = Math.max(0, Math.floor(elapsedSeconds));
  const stepSeconds = Math.max(1, policy.decayStepMinutes * 60);
  const steps = Math.floor(safeElapsed / stepSeconds);

  const rawMultiplier = 1 - (policy.decayStepPercent / 100) * steps;
  const floorMultiplier = policy.floorPercent / 100;
  const multiplier = Math.max(rawMultiplier, floorMultiplier);

  return Math.floor(basePoints * multiplier);
}

export function elapsedSecondsSince(startedAt: Date, at: Date = new Date()): number {
  return Math.max(0, Math.floor((at.getTime() - startedAt.getTime()) / 1000));
}
