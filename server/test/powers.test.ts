import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GameEngine, Outbound } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { advanceTo, engineWith, eventsNamed, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

function monsterHas(game: GameEngine, trait: { slot: 'hat' | 'mask' | 'item'; option: string }) {
  return game.player(game.monsterSeatId)!.costume[trait.slot] === trait.option
}

const dayResult = (events: Outbound[]) => eventsNamed(events, 'day:result')[0]
const powerState = (events: Outbound[]) => eventsNamed(events, 'you:power')[0]

// Moves to Day, has one Villager vote for the action, and the Monster use its power.
function dayWithPower(type: 'vampire' | 'witch', action: 'search' | 'commune' | 'candle', seed = 1) {
  const game = engineWith(5, type, seed)
  const [voter, other] = villagerIds(game)
  advanceTo(game, 'day')
  game.submitDay(voter, action === 'candle' ? { action, targetId: other } : { action })
  expect(game.usePower(game.monsterSeatId)).toBeNull()
  return { game, voter, other, events: game.endPhase() }
}

describe('power:use rules', () => {
  it('works once per game', () => {
    const game = engineWith(5, 'vampire')
    advanceTo(game, 'day')
    game.submitDay(villagerIds(game)[0], { action: 'commune' })
    expect(game.usePower(game.monsterSeatId)).toBeNull()
    expect(game.usePower(game.monsterSeatId)).toMatchObject({ code: 'power_used' })
    game.endPhase()
    advanceTo(game, 'day', 2)
    expect(game.usePower(game.monsterSeatId)).toMatchObject({ code: 'power_used' })
  })

  it('is Day only and Monster only', () => {
    const game = engineWith(5, 'witch')
    const [v1] = villagerIds(game)
    expect(game.usePower(game.monsterSeatId)).toMatchObject({ code: 'wrong_phase' })
    advanceTo(game, 'day')
    expect(game.usePower(v1)).toMatchObject({ code: 'not_allowed' })
  })
})

describe('Vampire', () => {
  it.each(['search', 'commune', 'candle'] as const)('blocks a %s, and the public result says so', (action) => {
    const { game, events } = dayWithPower('vampire', action)
    expect(dayResult(events)).toEqual({ round: 1, action, blocked: true })
    expect(eventsNamed(events, 'you:result')).toEqual([])
    expect(powerState(events)).toEqual({ powerUsed: true })
    expect(game.powerUsed).toBe(true)
  })

  it('a blocked Candle protects nobody', () => {
    const { game, other } = dayWithPower('vampire', 'candle')
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [other] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [other] }])
  })

  it('a blocked Search still takes Search off the next ballot', () => {
    const { game } = dayWithPower('vampire', 'search')
    advanceTo(game, 'morning', 2)
    expect(eventsNamed(game.endPhase(), 'day:options')[0]).toMatchObject({ search: false })
  })

  it('keeps the power on a day with no action', () => {
    const game = engineWith(5, 'vampire')
    advanceTo(game, 'day')
    game.usePower(game.monsterSeatId)
    expect(powerState(game.endPhase())).toEqual({ powerUsed: false })
  })
})

describe('Witch', () => {
  it('fakes a Search: the searcher gets a trait the Monster does not have, shaped like a real one', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const { game, voter, events } = dayWithPower('witch', 'search', seed)
      const [found] = events.filter((e) => e.event === 'you:result')
      expect(found.to).toEqual({ seatId: voter })
      expect(found.payload).toEqual({ round: 1, action: 'search', trait: { slot: expect.any(String), option: expect.any(String) } })
      expect(monsterHas(game, (found.payload as any).trait)).toBe(false)
      expect(dayResult(events)).toEqual({ round: 1, action: 'search', blocked: false, searcherId: voter })
      expect(game.powerUsed).toBe(true)
    }
  })

  it('fakes a Commune: the public trait is one the Monster does have', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const { game, events } = dayWithPower('witch', 'commune', seed)
      const result = dayResult(events)
      expect(result).toEqual({ round: 1, action: 'commune', blocked: false, trait: expect.any(Object) })
      expect(monsterHas(game, result.trait)).toBe(true)
      expect(powerState(events)).toEqual({ powerUsed: true })
    }
  })

  it('keeps the power when Candle wins, and when nothing happens', () => {
    const { game, events } = dayWithPower('witch', 'candle')
    expect(dayResult(events)).toEqual({ round: 1, action: 'candle', blocked: false })
    expect(powerState(events)).toEqual({ powerUsed: false })

    advanceTo(game, 'day', 2)
    expect(game.usePower(game.monsterSeatId)).toBeNull()
    expect(powerState(game.endPhase())).toEqual({ powerUsed: false })
    advanceTo(game, 'day', 3)
    expect(game.usePower(game.monsterSeatId)).toBeNull()
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

  it('takes no target, and rejects a second use and use outside Day', async () => {
    // Below 6 players the Monster is always a Vampire or Witch.
    harness = await startSocketServer({ clock, random: seededRandom(5) })
    const game = await startGame(harness, () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) }), 4)
    const [v1] = game.villagers
    game.monster.emit('power:use', {})
    expect(await game.monster.next('error')).toMatchObject({ code: 'wrong_phase', event: 'power:use' })

    clock.advance(40_000)
    await game.monster.next('phase:start', (p) => p.phase === 'day')
    // Older phones still send a target; it is ignored.
    await game.monster.send('power:use', { targetId: game.seatOf(v1) })
    expect(game.monster.all('error').filter((e: { event: string }) => e.event === 'power:use')).toHaveLength(1)
    game.monster.emit('power:use', {})
    expect(await game.monster.next('error', (e) => e.event === 'power:use')).toMatchObject({ code: 'power_used' })
    expect(getRoom(game.code)!.game!.monsterType).toMatch(/vampire|witch/)
  })
})
