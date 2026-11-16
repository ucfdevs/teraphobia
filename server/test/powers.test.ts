import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GameEngine } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { advanceTo, engineWith, eventsNamed, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

// The keys and value types of a result, so blocked/faked results can be compared with normal ones.
function shape(result: Record<string, unknown>) {
  return Object.entries(result)
    .map(([k, v]) => `${k}:${v === null ? 'null' : typeof v === 'object' ? Object.keys(v as object).sort().join('+') : typeof v}`)
    .sort()
    .join(',')
}

function monsterHas(game: GameEngine, trait: { slot: 'hat' | 'mask' | 'item'; option: string }) {
  return game.player(game.monsterSeatId)!.costume[trait.slot] === trait.option
}

describe('power:use rules', () => {
  it('works once per game', () => {
    const game = engineWith(5, 'vampire')
    const [v1, v2] = villagerIds(game)
    advanceTo(game, 'day')
    expect(game.usePower(game.monsterSeatId, v1)).toBeNull()
    expect(game.usePower(game.monsterSeatId, v2)).toMatchObject({ code: 'power_used' })
    advanceTo(game, 'day', 2)
    expect(game.usePower(game.monsterSeatId, v2)).toMatchObject({ code: 'power_used' })
  })

  it('is Day only, Monster only, and targets another living player', () => {
    const game = engineWith(5, 'witch')
    const [v1, v2] = villagerIds(game)
    expect(game.usePower(game.monsterSeatId, v1)).toMatchObject({ code: 'wrong_phase' })
    advanceTo(game, 'day')
    expect(game.usePower(v2, v1)).toMatchObject({ code: 'not_allowed' })
    expect(game.usePower(game.monsterSeatId, game.monsterSeatId)).toMatchObject({ code: 'invalid_target' })
    expect(game.usePower(game.monsterSeatId, 'nobody')).toMatchObject({ code: 'invalid_target' })
  })
})

describe('Vampire', () => {
  it('blocks a Search, a Commune, and a Candle with results shaped like normal ones', () => {
    for (const action of ['search', 'commune', 'candle'] as const) {
      const game = engineWith(7, 'vampire')
      const [victim, target, normal, guarded] = villagerIds(game)
      game.submitNight(game.monsterSeatId, { victimIds: [victim] })
      advanceTo(game, 'day')
      const pick = action === 'candle' ? { action, targetId: guarded } : { action }
      game.submitDay(target, pick)
      game.submitDay(normal, pick)
      expect(game.usePower(game.monsterSeatId, target)).toBeNull()

      const results = new Map(game.endPhase().map((e) => [(e.to as { seatId: string }).seatId, e.payload as Record<string, unknown>]))
      const blockedResult = results.get(target)!
      expect(shape(blockedResult)).toBe(shape({ ...results.get(normal)!, ...(action === 'candle' ? {} : { trait: null }) }))
      if (action === 'candle') expect(blockedResult).toEqual({ round: 1, action: 'candle', candleBlocked: true })
      else expect(blockedResult).toEqual({ round: 1, action, trait: null })
      expect(game.powerUsed).toBe(true)
    }
  })

  it('a blocked Candle doesn’t protect its target', () => {
    const game = engineWith(5, 'vampire')
    const [guard, target] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(guard, { action: 'candle', targetId: target })
    game.usePower(game.monsterSeatId, guard)
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [target] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [target] }])
  })
})

describe('Witch', () => {
  it('plants a fake trait that looks exactly like a real Search result', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const game = engineWith(5, 'witch', seed)
      const [target] = villagerIds(game)
      advanceTo(game, 'day')
      game.submitDay(target, { action: 'search' })
      game.usePower(game.monsterSeatId, target)
      const [result] = eventsNamed(game.endPhase(), 'you:result')
      expect(shape(result)).toBe('action:string,round:number,trait:option+slot')
      expect(monsterHas(game, result.trait)).toBe(false)
      expect(game.powerUsed).toBe(true)
    }
  })

  it('keeps the power when the target doesn’t Search', () => {
    const game = engineWith(5, 'witch')
    const [target, other] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(target, { action: 'candle', targetId: other })
    expect(game.usePower(game.monsterSeatId, target)).toBeNull()
    expect(eventsNamed(game.endPhase(), 'you:result')).toEqual([{ round: 1, action: 'candle', candleBlocked: false }])
    expect(game.powerUsed).toBe(false)

    advanceTo(game, 'day', 2)
    expect(game.usePower(game.monsterSeatId, target)).toBeNull()
  })
})

describe('Werewolf', () => {
  it('kills two players, but never on Night 1 and only once', () => {
    const game = engineWith(6, 'werewolf')
    const [a, b, c, d] = villagerIds(game)
    expect(game.submitNight(game.monsterSeatId, { victimIds: [a, b] })).toMatchObject({ code: 'wrong_phase' })
    expect(game.usePower(game.monsterSeatId, a)).toMatchObject({ code: 'not_allowed' })

    advanceTo(game, 'night', 2)
    expect(game.submitNight(game.monsterSeatId, { victimIds: [a, b] })).toBeNull()
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [a, b] }])
    expect(game.powerUsed).toBe(true)

    advanceTo(game, 'night', 3)
    expect(game.submitNight(game.monsterSeatId, { victimIds: [c, d] })).toMatchObject({ code: 'power_used' })
  })

  it('a candle saves one of the two victims', () => {
    const game = engineWith(6, 'werewolf')
    const [a, b, guard] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(guard, { action: 'candle', targetId: b })
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [a, b] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [a] }])
  })

  it('switching back to one victim keeps the power', () => {
    const game = engineWith(6, 'werewolf')
    const [a, b] = villagerIds(game)
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [a, b] })
    game.submitNight(game.monsterSeatId, { victimIds: [a] })
    game.endPhase()
    expect(game.powerUsed).toBe(false)
  })

  it('other Monsters can’t send two victims', () => {
    const game = engineWith(6, 'vampire')
    const [a, b] = villagerIds(game)
    advanceTo(game, 'night', 2)
    expect(game.submitNight(game.monsterSeatId, { victimIds: [a, b] })).toMatchObject({ code: 'not_allowed' })
  })
})

describe('power:use over sockets', () => {
  const HOST_ID = '64b000000000000000000001'
  let harness: SocketHarness
  let clock: ManualClock

  beforeEach(async () => {
    clearRooms()
    clock = new ManualClock()
  })

  afterEach(async () => {
    clearRooms()
    await harness.close()
  })

  it('rejects a second use and use outside Day', async () => {
    // Below 6 players the Monster is always a Vampire or Witch.
    harness = await startSocketServer({ clock, random: seededRandom(5) })
    const game = await startGame(harness, () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) }), 4)
    const [v1, v2] = game.villagers
    game.monster.emit('power:use', { targetId: game.seatOf(v1) })
    expect(await game.monster.next('error')).toMatchObject({ code: 'wrong_phase', event: 'power:use' })

    clock.advance(40_000)
    await game.monster.next('phase:start', (p) => p.phase === 'day')
    await game.monster.send('power:use', { targetId: game.seatOf(v1) })
    expect(game.monster.all('error').filter((e: { event: string }) => e.event === 'power:use')).toHaveLength(1)
    game.monster.emit('power:use', { targetId: game.seatOf(v2) })
    expect(await game.monster.next('error', (e) => e.event === 'power:use')).toMatchObject({ code: 'power_used' })
    expect(getRoom(game.code)!.game!.monsterType).toMatch(/vampire|witch/)
  })
})
