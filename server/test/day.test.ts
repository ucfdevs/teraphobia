import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/engine.js'
import type { Outbound } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom } from '../src/rooms/store.js'
import { advanceTo, engineWith, eventsNamed, SEATS, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

function monsterHas(game: GameEngine, trait: { slot: 'hat' | 'mask' | 'item'; option: string }) {
  return game.player(game.monsterSeatId)!.costume[trait.slot] === trait.option
}

const dayResult = (events: Outbound[]) => eventsNamed(events, 'day:result')[0]
const privateTo = (events: Outbound[], event: string) =>
  events.filter((e) => e.event === event).map((e) => ({ seatId: (e.to as { seatId: string }).seatId, payload: e.payload as any }))

describe('group ballot', () => {
  it('announces today’s ballot when Day starts', () => {
    const game = engineWith(5)
    game.endPhase()
    expect(eventsNamed(game.endPhase(), 'day:options')).toEqual([{ round: 1, search: true, commune: true }])
    expect(game.phase).toBe('day')
  })

  it('the action with the most ballots wins, and the last ballot counts', () => {
    const game = engineWith(5)
    const [v1, v2, v3, v4] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'search' })
    game.submitDay(v1, { action: 'commune' })
    game.submitDay(v2, { action: 'commune' })
    game.submitDay(v3, { action: 'candle', targetId: v4 })
    expect(dayResult(game.endPhase())).toMatchObject({ round: 1, action: 'commune', blocked: false })
  })

  it('counts the Monster’s ballot like anyone else’s', () => {
    const game = engineWith(4)
    const [v1, v2] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'commune' })
    game.submitDay(v2, { action: 'candle', targetId: v1 })
    game.submitDay(game.monsterSeatId, { action: 'candle', targetId: v2 })
    expect(dayResult(game.endPhase()).action).toBe('candle')
  })

  it('breaks a tie at random', () => {
    const winners = new Set<string>()
    for (let seed = 1; seed <= 60; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 4), seededRandom(seed))
      const [v1, v2] = villagerIds(game)
      advanceTo(game, 'day')
      game.submitDay(v1, { action: 'search' })
      game.submitDay(v2, { action: 'commune' })
      const { action } = dayResult(game.endPhase())
      expect(['search', 'commune']).toContain(action)
      winners.add(action)
    }
    expect(winners).toEqual(new Set(['search', 'commune']))
  })

  it('with no ballots, nothing happens', () => {
    const game = engineWith(5)
    advanceTo(game, 'day')
    const events = game.endPhase()
    expect(dayResult(events)).toEqual({ round: 1, action: 'none', blocked: false })
    expect(eventsNamed(events, 'you:result')).toEqual([])
  })

  it('takes Search off the ballot the day after a Search', () => {
    const game = engineWith(5)
    const [v1] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'search' })
    game.endPhase()

    advanceTo(game, 'morning', 2)
    expect(eventsNamed(game.endPhase(), 'day:options')).toEqual([{ round: 2, search: false, commune: true }])
    expect(game.submitDay(v1, { action: 'search' })).toMatchObject({ code: 'not_allowed' })
    game.submitDay(v1, { action: 'commune' })
    game.endPhase()

    advanceTo(game, 'morning', 3)
    expect(eventsNamed(game.endPhase(), 'day:options')).toEqual([{ round: 3, search: true, commune: true }])
  })

  it('only living players vote, only at Day', () => {
    const game = engineWith(5)
    const [dead, v2] = villagerIds(game)
    expect(game.submitDay(v2, { action: 'search' })).toMatchObject({ code: 'wrong_phase' })
    game.submitNight(game.monsterSeatId, { victimIds: [dead] })
    advanceTo(game, 'day')
    expect(game.submitDay(dead, { action: 'search' })).toMatchObject({ code: 'not_allowed' })
    expect(game.submitDay(v2, { action: 'candle', targetId: dead })).toMatchObject({ code: 'invalid_target' })
  })

  it('reports how many have voted, never what', () => {
    const game = engineWith(5)
    const [v1] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'search' })
    game.submitDay(v1, { action: 'commune' })
    game.submitDay(game.monsterSeatId, { action: 'commune' })
    expect(game.dayProgress()).toEqual({ round: 1, voted: 2, voters: 5 })
  })
})

describe('Search', () => {
  it('gives the trait privately to one Villager who voted Search, and names them publicly', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 6), seededRandom(seed))
      const [v1, v2, v3] = villagerIds(game)
      advanceTo(game, 'day')
      game.submitDay(v1, { action: 'search' })
      game.submitDay(v2, { action: 'search' })
      game.submitDay(game.monsterSeatId, { action: 'search' })
      game.submitDay(v3, { action: 'commune' })
      const events = game.endPhase()

      const [found] = privateTo(events, 'you:result')
      expect([v1, v2]).toContain(found.seatId)
      expect(found.payload).toEqual({ round: 1, action: 'search', trait: expect.any(Object) })
      expect(monsterHas(game, found.payload.trait)).toBe(true)
      expect(dayResult(events)).toEqual({ round: 1, action: 'search', blocked: false, searcherId: found.seatId })
      expect(privateTo(events, 'you:result')).toHaveLength(1)
    }
  })

  it('falls back to a random living Villager when only the Monster voted Search', () => {
    const searchers = new Set<string>()
    for (let seed = 1; seed <= 80; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 5), seededRandom(seed))
      advanceTo(game, 'day')
      game.submitDay(game.monsterSeatId, { action: 'search' })
      const [found] = privateTo(game.endPhase(), 'you:result')
      expect(villagerIds(game)).toContain(found.seatId)
      searchers.add(`villager ${villagerIds(game).indexOf(found.seatId)}`)
    }
    // Any of the 4 Villagers can be picked.
    expect(searchers.size).toBe(4)
  })

  it('always finds a trait (no caps, no empty Searches)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'game', 'engine.ts'), 'utf8')
    expect(source).not.toMatch(/SEARCH_CAP|COMMUNE_CAP|EMPTY_SEARCH_CHANCE/)
  })
})

describe('Commune', () => {
  it('shows everyone a trait the Monster does not have', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 5), seededRandom(seed))
      advanceTo(game, 'day')
      game.submitDay(villagerIds(game)[0], { action: 'commune' })
      const events = game.endPhase()
      const result = dayResult(events)
      expect(result).toEqual({ round: 1, action: 'commune', blocked: false, trait: expect.any(Object) })
      expect(monsterHas(game, result.trait)).toBe(false)
      expect(eventsNamed(events, 'you:result')).toEqual([])
    }
  })
})

describe('Candle', () => {
  it('protects the target with the most Candle votes, without naming them', () => {
    const game = engineWith(6)
    const [v1, v2, v3, v4] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'candle', targetId: v4 })
    game.submitDay(v2, { action: 'candle', targetId: v4 })
    game.submitDay(v3, { action: 'candle', targetId: v1 })
    const events = game.endPhase()
    expect(dayResult(events)).toEqual({ round: 1, action: 'candle', blocked: false })
    expect(JSON.stringify(events.filter((e) => e.to === 'room'))).not.toContain(`"${v4}"`)

    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [v4] })
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 2, deadIds: [] }])
  })

  it('breaks a tie between Candle targets at random', () => {
    const saved = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const game = new GameEngine(SEATS.slice(0, 5), seededRandom(seed))
      const [v1, v2, v3, v4] = villagerIds(game)
      advanceTo(game, 'day')
      game.submitDay(v1, { action: 'candle', targetId: v3 })
      game.submitDay(v2, { action: 'candle', targetId: v4 })
      game.endPhase()
      expect([v3, v4]).toContain(game.lastProtected)
      saved.add(game.lastProtected === v3 ? 'first' : 'second')
    }
    expect(saved.size).toBe(2)
  })

  it('refuses last night’s protected player, and only for one night', () => {
    const game = engineWith(5)
    const [v1, v2, v3] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'candle', targetId: v2 })
    game.endPhase()

    advanceTo(game, 'day', 2)
    expect(game.submitDay(v3, { action: 'candle', targetId: v2 })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitDay(v3, { action: 'candle', targetId: v1 })).toBeNull()
    game.endPhase()

    advanceTo(game, 'day', 3)
    expect(game.submitDay(v3, { action: 'candle', targetId: v2 })).toBeNull()
  })

  it('a Commune day clears the protection rule for the next Candle', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    advanceTo(game, 'day')
    game.submitDay(v1, { action: 'candle', targetId: v2 })
    game.endPhase()
    advanceTo(game, 'day', 2)
    game.submitDay(v1, { action: 'commune' })
    game.endPhase()
    advanceTo(game, 'day', 3)
    expect(game.submitDay(v1, { action: 'candle', targetId: v2 })).toBeNull()
  })
})

describe('Monster power state', () => {
  it('goes to the Monster, and only the Monster, after every Day', () => {
    const game = engineWith(5, 'vampire')
    advanceTo(game, 'day')
    expect(privateTo(game.endPhase(), 'you:power')).toEqual([{ seatId: game.monsterSeatId, payload: { powerUsed: false } }])
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

  async function toDay(game: Awaited<ReturnType<typeof startGame>>) {
    clock.advance(30_000 + 10_000)
    await game.host.next('phase:start', (p) => p.phase === 'day')
  }

  it('only the searcher receives the Search trait', async () => {
    const game = await startGame(harness, hostRoom, 6)
    await toDay(game)
    expect(await game.host.next('day:options')).toEqual({ round: 1, search: true, commune: true })
    for (const phone of game.phones) await phone.send('day:submit', { action: 'search' })
    await game.host.next('day:progress', (p) => p.voted === 6 && p.voters === 6)
    clock.advance(30_000)

    const result = await game.host.next('day:result')
    expect(result).toEqual({ round: 1, action: 'search', blocked: false, searcherId: expect.any(String) })
    const searcher = game.phones.find((p) => game.seatOf(p) === result.searcherId)!
    expect(searcher).not.toBe(game.monster)
    const found = await searcher.next('you:result')
    expect(found).toEqual({ round: 1, action: 'search', trait: expect.any(Object) })

    await Promise.all([game.host, ...game.phones].map((c) => c.flush()))
    for (const client of [game.host, ...game.phones]) {
      if (client === searcher) continue
      expect(client.all('you:result')).toEqual([])
      expect(JSON.stringify(client.log)).not.toContain(JSON.stringify(found.trait))
    }
    expect(game.monster.all('you:power')).toEqual([{ powerUsed: false }])
  })

  it('plays group-vote Days through to a winner', async () => {
    const game = await startGame(harness, hostRoom, 5)
    const monsterSeat = game.seatOf(game.monster)
    for (const round of [1, 2]) {
      clock.advance(30_000 + 10_000)
      await game.host.next('day:options', (o) => o.round === round)
      for (const phone of game.phones) await phone.send('day:submit', { action: 'commune' })
      clock.advance(30_000)
      expect(await game.host.next('day:result', (r) => r.round === round)).toMatchObject({ round, action: 'commune', blocked: false })
      clock.advance(60_000)
      await game.host.next('phase:start', (p) => p.phase === 'vote' && p.round === round)
      // Round 1 skips; round 2 the Villagers banish the Monster.
      for (const v of game.villagers) await v.send('vote:submit', { targetId: round === 2 ? monsterSeat : null })
      clock.advance(30_000)
    }
    expect(await game.host.next('game:over')).toMatchObject({ winner: 'villagers', endReason: 'banished', rounds: 2 })
  })

  it('no client learns who the Candle protects', async () => {
    const game = await startGame(harness, hostRoom, 5)
    await toDay(game)
    const [voter, target] = game.villagers
    await voter.send('day:submit', { action: 'candle', targetId: game.seatOf(target) })
    clock.advance(30_000)
    expect(await game.host.next('day:result')).toEqual({ round: 1, action: 'candle', blocked: false })

    // Only the voter's own outgoing ballot named the target; nothing the server sent does.
    await Promise.all([game.host, ...game.phones].map((c) => c.flush()))
    const sentAfterDay = (client: (typeof game.phones)[number]) =>
      client.log.slice(client.log.findIndex((r) => r.event === 'day:options')).filter((r) => r.event !== 'room:state')
    for (const client of [game.host, ...game.phones]) expect(JSON.stringify(sentAfterDay(client))).not.toContain(game.seatOf(target))
  })
})
