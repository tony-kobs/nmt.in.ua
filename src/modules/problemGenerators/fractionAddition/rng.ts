/**
 * Deterministic RNG for problem generators. Production callers can omit it
 * (defaults to `Math.random`); tests inject `createSeededRandom(seed)` so
 * generated tasks are reproducible without flakiness.
 */

export type RandomSource = () => number;

/** mulberry32 — small, fast, good-enough distribution for task generation. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in `[min, max]`, both inclusive. */
export function randomInt(rng: RandomSource, min: number, max: number): number {
  if (max < min) {
    throw new Error(`randomInt: empty range [${min}, ${max}]`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

export function pickRandom<T>(rng: RandomSource, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pickRandom: items must not be empty");
  }
  return items[randomInt(rng, 0, items.length - 1)];
}
