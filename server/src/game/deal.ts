import { pick, randomIndex, shuffle } from './random.js'
import type { Rng } from './random.js'

// Pure deal rules from the PRD Setup section. No I/O.

export const SLOTS = ['hat', 'mask', 'item'] as const
export type Slot = (typeof SLOTS)[number]
export type Costume = Record<Slot, string>
export type MonsterType = 'vampire' | 'witch' | 'werewolf'

// Ids match the sprite names in web/public/sprites and shared/schemas/common.schema.json (#78).
export const OPTIONS: Record<Slot, string[]> = {
  hat: ['top-hat', 'jester-cap', 'crown', 'horned-helmet'],
  mask: ['domino-mask', 'beak-mask', 'pumpkin-mask', 'skull-mask'],
  item: ['lantern', 'pitchfork', 'umbrella', 'raven'],
}

export const WEREWOLF_MIN_PLAYERS = 6

const key = (costume: Costume) => SLOTS.map((slot) => costume[slot]).join('|')

export function sharedTraits(a: Costume, b: Costume) {
  return SLOTS.filter((slot) => a[slot] === b[slot]).length
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

// Most players who may wear any one option in a slot, so no trait points at most of the room.
export function optionCap(count: number) {
  return Math.ceil(count / 2)
}

const ALL_COSTUMES: Costume[] = OPTIONS.hat.flatMap((hat) =>
  OPTIONS.mask.flatMap((mask) => OPTIONS.item.map((item) => ({ hat, mask, item }))),
)

// One attempt at a deal, or null if it painted itself into a corner (the caller retries).
function tryDeal(count: number, rng: Rng): Costume[] | null {
  const dealt: Costume[] = []
  const used = new Set<string>()
  const worn = Object.fromEntries(SLOTS.map((slot) => [slot, new Map<string, number>()])) as Record<Slot, Map<string, number>>
  const cap = optionCap(count)

  const fits = (c: Costume) => !used.has(key(c)) && SLOTS.every((slot) => (worn[slot].get(c[slot]) ?? 0) < cap)
  // Options nobody wears yet make a costume more attractive.
  const fresh = (c: Costume) => SLOTS.filter((slot) => !worn[slot].has(c[slot])).length
  // A random candidate among those with the most fresh options.
  const choose = (candidates: Costume[]) => {
    const allowed = candidates.filter(fits)
    if (allowed.length === 0) return null
    const best = Math.max(...allowed.map(fresh))
    return pick(rng, allowed.filter((c) => fresh(c) === best))
  }

  while (dealt.length < count) {
    const lonely = dealt.filter((c) => !dealt.some((o) => o !== c && sharedTraits(c, o) === 2))
    let next: Costume | null
    if (lonely.length > 0) {
      // Give the newest lonely costume a lookalike first.
      next = choose(lookalikes(lonely[lonely.length - 1]))
    } else if (dealt.length === 0 || (count - dealt.length >= 2 && rng() < 0.5)) {
      // Start a new lookalike group, only while there is room to finish it.
      next = choose(ALL_COSTUMES)
    } else {
      next = choose(dealt.flatMap(lookalikes))
    }
    if (!next) return null
    used.add(key(next))
    for (const slot of SLOTS) worn[slot].set(next[slot], (worn[slot].get(next[slot]) ?? 0) + 1)
    dealt.push(next)
  }
  return dealt
}

// Every costume is unique and has a lookalike, and no option is worn by more than optionCap players.
export function isSpreadDeal(costumes: Costume[]) {
  const cap = optionCap(costumes.length)
  return SLOTS.every((slot) => {
    const counts = new Map<string, number>()
    for (const c of costumes) counts.set(c[slot], (counts.get(c[slot]) ?? 0) + 1)
    return Math.max(...counts.values()) <= cap
  })
}

// Deals `count` costumes in random order.
export function dealCostumes(count: number, rng: Rng): Costume[] {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const costumes = tryDeal(count, rng)
    if (costumes && isFairDeal(costumes) && isSpreadDeal(costumes)) return shuffle(rng, costumes)
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
