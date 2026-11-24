import { describe, expect, it } from 'vitest'
import { formatReport, PLAYER_COUNTS, playGame, runBalance, simulate } from '../src/game/balance.js'
import { GameEngine } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { advanceTo, SEATS, villagerIds } from './engineHelpers.js'

describe('balance simulation', () => {
  it('prints a row for every player count, for both versions of the Search rule', () => {
    const report = formatReport(runBalance(50, 1))
    for (const n of PLAYER_COUNTS) expect(report.match(new RegExp(`^${n}\\s+\\d`, 'gm'))).toHaveLength(2)
    expect(report).toMatch(/Recommendation: (keep|drop) "no Search two days in a row"/)
  })

  it('gives the same output for the same seed, and different output for another', () => {
    expect(formatReport(runBalance(100, 7))).toBe(formatReport(runBalance(100, 7)))
    expect(formatReport(runBalance(100, 7))).not.toBe(formatReport(runBalance(100, 8)))
  })

  it('plays every game to a winner with legal bot moves', () => {
    // playGame throws if the engine refuses a bot's move.
    for (const n of PLAYER_COUNTS) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const { winner, rounds } = playGame(n, seed)
        expect(['villagers', 'monster']).toContain(winner)
        expect(rounds).toBeLessThan(50)
      }
    }
  })

  it('reports win rates that add up, and flags counts outside 40-60%', () => {
    const row = simulate(6, 200, 3)
    expect(row.villagerWinRate + row.monsterWinRate).toBeCloseTo(1)
    expect(row.inTarget).toBe(row.villagerWinRate >= 0.4 && row.villagerWinRate <= 0.6)
    expect(row.averageRounds).toBeGreaterThanOrEqual(1)
  })
})

describe('searchCooldown rule switch', () => {
  it('lets Search back on the ballot the next day when turned off', () => {
    const on = new GameEngine(SEATS.slice(0, 5), seededRandom(1))
    const off = new GameEngine(SEATS.slice(0, 5), seededRandom(1), { searchCooldown: false })
    for (const game of [on, off]) {
      advanceTo(game, 'day')
      game.submitDay(villagerIds(game)[0], { action: 'search' })
      game.endPhase()
      advanceTo(game, 'day', 2)
    }
    expect(on.dayOptions().search).toBe(false)
    expect(off.dayOptions().search).toBe(true)
  })
})
