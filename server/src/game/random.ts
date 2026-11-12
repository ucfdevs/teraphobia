import { randomInt } from 'node:crypto'

// A source of floats in [0, 1). The engine takes one so tests and the balance script can seed it.
export type Rng = () => number

// Production randomness.
export const secureRandom: Rng = () => randomInt(2 ** 32) / 2 ** 32

// Small, fast seeded generator (mulberry32) for repeatable games.
export function seededRandom(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

export function randomIndex(rng: Rng, length: number) {
  return Math.floor(rng() * length)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomIndex(rng, items.length)]
}

// Fisher-Yates on a copy.
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomIndex(rng, i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
