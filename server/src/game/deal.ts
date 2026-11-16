import { pick, randomIndex, shuffle } from './random.js'
import type { Rng } from './random.js'

// Pure deal rules from the PRD Setup section. No I/O.

export const SLOTS = ['hat', 'mask', 'item'] as const
export type Slot = (typeof SLOTS)[number]
export type Costume = Record<Slot, string>
export type MonsterType = 'vampire' | 'witch' | 'werewolf'

export const OPTIONS_PER_SLOT = 4
// Option ids until the costume art names them: hat1..hat4, mask1..mask4, item1..item4.
export const OPTIONS: Record<Slot, string[]> = Object.fromEntries(
  SLOTS.map((slot) => [slot, Array.from({ length: OPTIONS_PER_SLOT }, (_, i) => `${slot}${i + 1}`)]),
) as Record<Slot, string[]>

export const WEREWOLF_MIN_PLAYERS = 6

const key = (costume: Costume) => SLOTS.map((slot) => costume[slot]).join('|')

export function sharedTraits(a: Costume, b: Costume) {
  return SLOTS.filter((slot) => a[slot] === b[slot]).length
}

function randomCostume(rng: Rng): Costume {
  return { hat: pick(rng, OPTIONS.hat), mask: pick(rng, OPTIONS.mask), item: pick(rng, OPTIONS.item) }
}

// The 9 costumes that differ from this one in exactly one slot.
export function lookalikes(costume: Costume): Costume[] {
  return SLOTS.flatMap((slot) => OPTIONS[slot].filter((o) => o !== costume[slot]).map((option) => ({ ...costume, [slot]: option })))
}

// No two identical, and each shares 2 of 3 traits with at least one other.
export function isFairDeal(costumes: Costume[]) {
  if (new Set(costumes.map(key)).size !== costumes.length) return false
  return costumes.every((c, i) => costumes.some((other, j) => i !== j && sharedTraits(c, other) === 2))
}

function tryDeal(count: number, rng: Rng): Costume[] {
  const dealt: Costume[] = []
  const used = new Set<string>()
  const unusedLookalikes = (c: Costume) => lookalikes(c).filter((l) => !used.has(key(l)))

  while (dealt.length < count) {
    const lonely = dealt.filter((c) => !dealt.some((o) => o !== c && sharedTraits(c, o) === 2))
    let next: Costume | undefined
    if (lonely.length > 0) {
      // Give the newest lonely costume a lookalike first.
      next = pick(rng, unusedLookalikes(lonely[lonely.length - 1]))
    } else if (dealt.length === 0 || (count - dealt.length >= 2 && rng() < 0.5)) {
      // Start a new lookalike group, only while there is room to finish it.
      next = randomCostume(rng)
    } else {
      const options = dealt.flatMap(unusedLookalikes)
      next = options[randomIndex(rng, options.length)]
    }
    if (!next || used.has(key(next))) continue
    used.add(key(next))
    dealt.push(next)
  }
  return dealt
}

// Deals `count` costumes in random order.
export function dealCostumes(count: number, rng: Rng): Costume[] {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const costumes = tryDeal(count, rng)
    if (isFairDeal(costumes)) return shuffle(rng, costumes)
  }
  throw new Error(`Could not deal ${count} fair costumes`)
}

// Vampire 40%, Witch 40%, Werewolf 20% with 6+ players; otherwise Vampire and Witch 50% each.
export function pickMonsterType(playerCount: number, rng: Rng): MonsterType {
  const roll = rng()
  if (playerCount >= WEREWOLF_MIN_PLAYERS) return roll < 0.4 ? 'vampire' : roll < 0.8 ? 'witch' : 'werewolf'
  return roll < 0.5 ? 'vampire' : 'witch'
}

export interface Deal {
  costumes: Costume[]
  monsterIndex: number
  monsterType: MonsterType
}

export function deal(playerCount: number, rng: Rng): Deal {
  return {
    costumes: dealCostumes(playerCount, rng),
    monsterIndex: randomIndex(rng, playerCount),
    monsterType: pickMonsterType(playerCount, rng),
  }
}
