import { describe, expect, it } from 'vitest'
import { deal, dealCostumes, isFairDeal, isSpreadDeal, optionCap, OPTIONS, pickMonsterType, sharedTraits, SLOTS } from '../src/game/deal.js'
import { GameEngine } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'

const PLAYER_COUNTS = [4, 5, 6, 7, 8]

describe('dealCostumes', () => {
  it.each(PLAYER_COUNTS)('10,000 seeded deals for %i players are all unique and have lookalikes', (count) => {
    const rng = seededRandom(count)
    for (let i = 0; i < 10_000; i += 1) {
      const costumes = dealCostumes(count, rng)
      expect(costumes).toHaveLength(count)
      // Checked by hand as well as by isFairDeal, so a bug in one can't hide the other.
      const keys = new Set(costumes.map((c) => `${c.hat}|${c.mask}|${c.item}`))
      if (keys.size !== count) throw new Error(`Duplicate costume in deal ${i}`)
      for (const c of costumes) {
        if (!costumes.some((o) => o !== c && sharedTraits(c, o) === 2)) throw new Error(`Costume without a lookalike in deal ${i}`)
        for (const slot of SLOTS) if (!OPTIONS[slot].includes(c[slot])) throw new Error(`Bad option ${c[slot]}`)
      }
      if (!isFairDeal(costumes)) throw new Error(`isFairDeal disagrees on deal ${i}`)
    }
  })

  it('repeats with the same seed and varies across seeds', () => {
    expect(dealCostumes(6, seededRandom(42))).toEqual(dealCostumes(6, seededRandom(42)))
    expect(dealCostumes(6, seededRandom(42))).not.toEqual(dealCostumes(6, seededRandom(43)))
  })

  it('isFairDeal catches duplicates and loners', () => {
    const a = { hat: 'top-hat', mask: 'domino-mask', item: 'lantern' }
    const b = { hat: 'top-hat', mask: 'domino-mask', item: 'pitchfork' }
    const loner = { hat: 'horned-helmet', mask: 'skull-mask', item: 'raven' }
    expect(isFairDeal([a, b])).toBe(true)
    expect(isFairDeal([a, a])).toBe(false)
    expect(isFairDeal([a, b, loner])).toBe(false)
  })
})

describe('Monster type', () => {
  it.each([4, 5])('never deals a Werewolf to %i players, and splits Vampire and Witch evenly', (count) => {
    const rng = seededRandom(100 + count)
    const tally = { vampire: 0, witch: 0, werewolf: 0 }
    for (let i = 0; i < 10_000; i += 1) tally[pickMonsterType(count, rng)] += 1
    expect(tally.werewolf).toBe(0)
    expect(Math.abs(tally.vampire / 100 - 50)).toBeLessThan(3)
  })

  it('over 10,000 deals at 8 players each type is within 3 points of its odds', () => {
    const rng = seededRandom(8)
    const tally = { vampire: 0, witch: 0, werewolf: 0 }
    for (let i = 0; i < 10_000; i += 1) tally[deal(8, rng).monsterType] += 1
    expect(Math.abs(tally.vampire / 100 - 40)).toBeLessThan(3)
    expect(Math.abs(tally.witch / 100 - 40)).toBeLessThan(3)
    expect(Math.abs(tally.werewolf / 100 - 20)).toBeLessThan(3)
  })

  it('picks every seat as the Monster about equally', () => {
    const rng = seededRandom(9)
    const counts = Array(5).fill(0)
    for (let i = 0; i < 10_000; i += 1) counts[deal(5, rng).monsterIndex] += 1
    for (const n of counts) expect(Math.abs(n / 100 - 20)).toBeLessThan(3)
  })
})

describe('GameEngine roles', () => {
  it('has exactly one Monster and only its you:role names the type', () => {
    const seats = ['a', 'b', 'c', 'd', 'e', 'f']
    const game = new GameEngine(seats, seededRandom(1))
    const roles = seats.map((s) => game.youRole(s))
    const monsters = roles.filter((r) => r.role === 'monster')
    expect(monsters).toHaveLength(1)
    expect(monsters[0]).toMatchObject({ seatId: game.monsterSeatId, monsterType: game.monsterType })
    for (const r of roles.filter((r) => r.role === 'villager')) expect(r).not.toHaveProperty('monsterType')
  })
})

describe('spread deal (#106)', () => {
  // Average distinct options per slot before #106, from the issue.
  const BASELINE: Record<number, number> = { 4: 2.11, 5: 2.44, 6: 2.72, 7: 2.96, 8: 3.16 }

  it.each(PLAYER_COUNTS)('5,000 seeded deals for %i players stay fair, under the cap, and more spread out', (count) => {
    const rng = seededRandom(5000 + count)
    const cap = optionCap(count)
    let distinct = 0
    for (let i = 0; i < 5_000; i += 1) {
      const costumes = dealCostumes(count, rng)
      if (!isFairDeal(costumes)) throw new Error(`Unfair deal ${i}`)
      for (const slot of SLOTS) {
        const worn = new Map<string, number>()
        for (const c of costumes) worn.set(c[slot], (worn.get(c[slot]) ?? 0) + 1)
        if (Math.max(...worn.values()) > cap) throw new Error(`Deal ${i} puts one ${slot} on more than ${cap} players`)
        distinct += worn.size
      }
    }
    const average = distinct / 5_000 / SLOTS.length
    console.log(`${count} players: ${average.toFixed(2)} distinct options per slot (was ${BASELINE[count]})`)
    expect(average).toBeGreaterThan(BASELINE[count])
  })

  it('isSpreadDeal catches an option worn by more than half the room', () => {
    const c = (hat: string, mask: string, item: string) => ({ hat, mask, item })
    const crowded = [c('crown', 'beak-mask', 'lantern'), c('crown', 'beak-mask', 'raven'), c('crown', 'skull-mask', 'raven'), c('top-hat', 'skull-mask', 'raven')]
    expect(isFairDeal(crowded)).toBe(true)
    expect(isSpreadDeal(crowded)).toBe(false)
  })
})
