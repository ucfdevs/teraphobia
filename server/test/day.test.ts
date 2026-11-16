import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_SEARCH_CHANCE, GameEngine } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom } from '../src/rooms/store.js'
import { advanceTo, engineWith, eventsNamed, SEATS, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

function monsterHas(game: GameEngine, trait: { slot: 'hat' | 'mask' | 'item'; option: string }) {
  return game.player(game.monsterSeatId)!.costume[trait.slot] === trait.option
}

// Kills one Villager on Night 1 so Commune has spirits, and moves to Day.
function dayAfterADeath(game: GameEngine) {
  const victim = villagerIds(game)[0]
  game.submitNight(game.monsterSeatId, { victimIds: [victim] })
  advanceTo(game, 'day')
  return villagerIds(game).filter((id) => id !== victim)
}

describe('Search', () => {
  it('with 5 searchers, at most 2 get a trait, and every trait is the Monster’s', () => {
    let traits = 0
    let winnersEmpty = 0
    for (let seed = 1; seed <= 500; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 6), seededRandom(seed))
      advanceTo(game, 'day')
      for (const id of villagerIds(game)) game.submitDay(id, { action: 'search' })
      const results = eventsNamed(game.endPhase(), 'you:result')
      expect(results).toHaveLength(5)
      const found = results.filter((r) => r.trait !== null)
      expect(found.length).toBeLessThanOrEqual(2)
      for (const r of found) expect(monsterHas(game, r.trait)).toBe(true)
      traits += found.length
      winnersEmpty += 2 - found.length
    }
    // About 20% of the 2 successful slots come back empty.
    expect(Math.abs(winnersEmpty / 1000 - EMPTY_SEARCH_CHANCE)).toBeLessThan(0.05)
    expect(traits).toBeGreaterThan(0)
  })
})

describe('Commune', () => {
  it('never returns a trait the Monster has, and at most 2 succeed', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 7), seededRandom(seed))
      const living = dayAfterADeath(game)
      for (const id of living) game.submitDay(id, { action: 'commune' })
      const results = eventsNamed(game.endPhase(), 'you:result')
      const found = results.filter((r) => r.trait !== null)
      expect(found.length).toBe(2)
      for (const r of found) expect(monsterHas(game, r.trait)).toBe(false)
    }
  })

  it('is silent when nobody died last night', () => {
    const game = engineWith(5)
    advanceTo(game, 'day')
    for (const id of villagerIds(game)) game.submitDay(id, { action: 'commune' })
    for (const r of eventsNamed(game.endPhase(), 'you:result')) expect(r).toEqual({ round: 1, action: 'commune', trait: null })
  })
})

describe('Candle', () => {
  it('rejects yourself, the dead, and the same player two nights in a row', () => {
    const game = engineWith(6)
    const living = dayAfterADeath(game)
    const [me, friend, other] = living
    const dead = villagerIds(game).find((id) => !game.alive(id))!
    expect(game.submitDay(me, { action: 'candle', targetId: me })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitDay(me, { action: 'candle', targetId: dead })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitDay(me, { action: 'candle', targetId: friend })).toBeNull()
    expect(eventsNamed(game.endPhase(), 'you:result')).toEqual([{ round: 1, action: 'candle', candleBlocked: false }])

    advanceTo(game, 'day', 2)
    expect(game.submitDay(me, { action: 'candle', targetId: friend })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitDay(me, { action: 'candle', targetId: other })).toBeNull()
    game.endPhase()

    // Two Days later the first target is allowed again.
    advanceTo(game, 'day', 3)
    expect(game.submitDay(me, { action: 'candle', targetId: friend })).toBeNull()
  })

  it('saves the Monster’s victim that night, silently', () => {
    const game = engineWith(5)
    const [guard, target] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(guard, { action: 'candle', targetId: target })
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [target] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [] }])
    expect(game.alive(target)).toBe(true)

    // The protection lasts one night only.
    advanceTo(game, 'night', 3)
    game.submitNight(game.monsterSeatId, { victimIds: [target] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 3, deadIds: [target] }])
  })
})

describe('Day rules', () => {
  it('only living Villagers act, only at Day, and the last pick counts', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    expect(game.submitDay(v1, { action: 'search' })).toMatchObject({ code: 'wrong_phase' })
    advanceTo(game, 'day')
    expect(game.submitDay(game.monsterSeatId, { action: 'search' })).toMatchObject({ code: 'not_allowed' })
    game.submitDay(v1, { action: 'search' })
    game.submitDay(v1, { action: 'candle', targetId: v2 })
    expect(eventsNamed(game.endPhase(), 'you:result')).toEqual([{ round: 1, action: 'candle', candleBlocked: false }])
  })

  it('a player with no pick gets no result', () => {
    const game = engineWith(5)
    advanceTo(game, 'day')
    expect(game.endPhase()).toEqual([])
  })
})

describe('Day over sockets', () => {
  const HOST_ID = '64b000000000000000000001'
  let harness: SocketHarness
  let clock: ManualClock
  const hostRoom = () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) })

  beforeEach(async () => {
    clearRooms()
    clock = new ManualClock()
    harness = await startSocketServer({ clock, random: seededRandom(11) })
  })

  afterEach(async () => {
    clearRooms()
    await harness.close()
  })

  it('sends each result only to its player', async () => {
    const game = await startGame(harness, hostRoom, 6)
    clock.advance(30_000 + 10_000)
    await game.host.next('phase:start', (p) => p.phase === 'day')
    const [searcher, communer, lighter, ...idle] = game.villagers
    await searcher.send('day:submit', { action: 'search' })
    await communer.send('day:submit', { action: 'commune' })
    await lighter.send('day:submit', { action: 'candle', targetId: game.seatOf(searcher) })
    clock.advance(30_000)
    await game.host.next('phase:start', (p) => p.phase === 'discussion')
    await Promise.all(game.phones.map((p) => p.flush()))

    const [search] = searcher.all('you:result')
    expect(searcher.all('you:result')).toHaveLength(1)
    expect(search).toMatchObject({ round: 1, action: 'search' })
    expect(search).toHaveProperty('trait')
    expect(communer.all('you:result')).toEqual([{ round: 1, action: 'commune', trait: null }])
    expect(lighter.all('you:result')).toEqual([{ round: 1, action: 'candle', candleBlocked: false }])
    for (const phone of [game.monster, ...idle, game.host]) expect(phone.all('you:result')).toEqual([])
  })

  it('rejects the Monster’s day:submit and a candle on yourself', async () => {
    const game = await startGame(harness, hostRoom, 4)
    clock.advance(40_000)
    await game.host.next('phase:start', (p) => p.phase === 'day')
    game.monster.emit('day:submit', { action: 'search' })
    expect(await game.monster.next('error')).toMatchObject({ code: 'not_allowed', event: 'day:submit' })
    const [v1] = game.villagers
    v1.emit('day:submit', { action: 'candle', targetId: game.seatOf(v1) })
    expect(await v1.next('error')).toMatchObject({ code: 'invalid_target' })
  })
})
