// Challenge data now lives under src/ (so it is part of the compiled build and
// can be imported by the artifacts route). This shim preserves the previous
// import path used by prisma/seed.ts.
export * from '../src/challenges/challenge-data.js';
