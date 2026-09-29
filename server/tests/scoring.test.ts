import { describe, it, expect } from 'vitest';
import { computeAwardedPoints } from '../src/scoring/scoring.service.js';

const policy = { decayStepMinutes: 15, decayStepPercent: 10, floorPercent: 25 };

describe('scoring: time decay', () => {
  it('awards full base points at t=0', () => {
    expect(computeAwardedPoints(200, 0, policy)).toBe(200);
  });

  it('holds full points within the first step (0-14 min)', () => {
    expect(computeAwardedPoints(200, 14 * 60, policy)).toBe(200);
  });

  it('drops 10% per 15-minute step', () => {
    expect(computeAwardedPoints(200, 15 * 60, policy)).toBe(180); // 1 step
    expect(computeAwardedPoints(200, 30 * 60, policy)).toBe(160); // 2 steps
    expect(computeAwardedPoints(200, 45 * 60, policy)).toBe(140); // 3 steps
    expect(computeAwardedPoints(200, 60 * 60, policy)).toBe(120); // 4 steps
  });

  it('never drops below the 25% floor', () => {
    // Many steps → clamp to floor
    expect(computeAwardedPoints(200, 100 * 60 * 60, policy)).toBe(50); // 25% of 200
    expect(computeAwardedPoints(100, 100 * 60 * 60, policy)).toBe(25);
  });

  it('rounds down to an integer', () => {
    // 150 * 0.9 = 135 exactly; 130 * 0.9 = 117
    expect(computeAwardedPoints(150, 15 * 60, policy)).toBe(135);
    expect(computeAwardedPoints(130, 15 * 60, policy)).toBe(117);
  });
});
