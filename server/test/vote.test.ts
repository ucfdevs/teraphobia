import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from '../src/game/engine.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { Game } from '../src/models/game.js'
import { GamePlayer } from '../src/models/gamePlayer.js'
import { User } from '../src/models/user.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { createUser } from './helpers.js'
import { advanceTo, engineWith, eventsNamed, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

describe('vote and banish rule', () => {
  it('banishes a player with more votes than any other option, and shows who voted for whom', () => {
    const game = engineWith(5)
    const [v1, v2, v3, v4] = villagerIds(game)
    advanceTo(game, 'vote')
    game.submitVote(v1, v4)
    game.submitVote(v2, v4)
    game.submitVote(v3, null)
    // v4: 3 votes, Skip: 1, v1: 1.
    game.submitVote(v4, v1)
    game.submitVote(game.monsterSeatId, v4)
    const [reveal] = eventsNamed(game.endPhase(), 'vote:reveal')
    expect(reveal.banishedId).toBe(v4)
    expect(reveal.votes).toEqual(
      expect.arrayContaining([
        { voterId: v1, targetId: v4 },
        { voterId: v3, targetId: null },
        { voterId: game.monsterSeatId, targetId: v4 },
      ]),
    )
    expect(reveal.votes).toHaveLength(5)
    expect(game.player(v4)).toMatchObject({ lifeStatus: 'banished', diedRound: 1 })
  })

  it('a tie banishes nobody', () => {
    const game = engineWith(4)
    const [v1, v2, v3] = villagerIds(game)
    advanceTo(game, 'vote')
    game.submitVote(v1, v2)
    game.submitVote(v2, v1)
    game.submitVote(v3, v2)
    game.submitVote(game.monsterSeatId, v1)
    expect(eventsNamed(game.endPhase(), 'vote:reveal')[0].banishedId).toBeNull()
    expect(game.livingPlayers()).toHaveLength(4)
  })

  it('a Skip majority, or a tie with Skip, banishes nobody', () => {
    const game = engineWith(5)
    const [v1, v2, v3, v4] = villagerIds(game)
    advanceTo(game, 'vote')
    game.submitVote(v1, v2)
    game.submitVote(v2, null)
    game.submitVote(v3, null)
    game.submitVote(v4, v2)
    game.submitVote(game.monsterSeatId, null)
    expect(eventsNamed(game.endPhase(), 'vote:reveal')[0].banishedId).toBeNull()

    advanceTo(game, 'vote', 2)
    game.submitVote(v1, v2)
    game.submitVote(v4, v2)
    game.submitVote(v2, null)
    game.submitVote(v3, null)
    // The Monster's vote is missed: Skip has 3, v2 has 2.
    expect(eventsNamed(game.endPhase(), 'vote:reveal')[0].banishedId).toBeNull()
  })

  it('counts missed votes as Skip', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    advanceTo(game, 'vote')
    game.submitVote(v1, v2)
    const [reveal] = eventsNamed(game.endPhase(), 'vote:reveal')
    expect(reveal.banishedId).toBeNull()
    expect(reveal.votes.filter((v: { targetId: string | null }) => v.targetId === null)).toHaveLength(4)
  })

  it('only living players vote, at Vote, for a living player', () => {
    const game = engineWith(5)
    const [dead, v2] = villagerIds(game)
    game.submitNight(game.monsterSeatId, { victimIds: [dead] })
    expect(game.submitVote(v2, null)).toMatchObject({ code: 'wrong_phase' })
    advanceTo(game, 'vote')
    expect(game.submitVote(dead, v2)).toMatchObject({ code: 'not_allowed' })
    expect(game.submitVote(v2, dead)).toMatchObject({ code: 'invalid_target' })
    const [reveal] = eventsNamed(game.endPhase(), 'vote:reveal')
    expect(reveal.votes.map((v: { voterId: string }) => v.voterId)).not.toContain(dead)
  })
})

describe('win checks', () => {
  it('Villagers win when the Monster is banished', () => {
    const game = engineWith(5)
    advanceTo(game, 'vote')
    for (const id of villagerIds(game)) game.submitVote(id, game.monsterSeatId)
    const events = game.endPhase()
    expect(eventsNamed(events, 'game:over')).toEqual([
      { winner: 'villagers', endReason: 'banished', rounds: 1, monster: { seatId: game.monsterSeatId, monsterType: game.monsterType }, hunches: [] },
    ])
    expect(game.over).toBeDefined()
    // A finished game takes no more phases or events.
    expect(game.endPhase()).toEqual([])
    expect(game.submitVote(villagerIds(game)[0], null)).toMatchObject({ code: 'wrong_phase' })
  })

  it('the Monster wins after Morning when one Villager is left', () => {
    const game = engineWith(4)
    const [v1, v2, v3] = villagerIds(game)
    game.submitNight(game.monsterSeatId, { victimIds: [v1] })
    game.submitNight(v2, { suspectId: game.monsterSeatId })
    game.endPhase()
    expect(game.endPhase()).toEqual([]) // Morning 1: two Villagers left
    advanceTo(game, 'night', 2)
    game.submitNight(game.monsterSeatId, { victimIds: [v2] })
    game.endPhase()
    expect(eventsNamed(game.endPhase(), 'game:over')).toEqual([
      {
        winner: 'monster',
        endReason: 'outnumbered',
        rounds: 2,
        monster: { seatId: game.monsterSeatId, monsterType: game.monsterType },
        hunches: [{ seatId: v2, round: 1, suspectId: game.monsterSeatId }],
      },
    ])
    expect(game.alive(v3)).toBe(true)
  })

  it('the Monster wins after a vote that leaves one Villager', () => {
    const game = engineWith(4)
    const [v1, v2, v3] = villagerIds(game)
    game.submitNight(game.monsterSeatId, { victimIds: [v1] })
    advanceTo(game, 'vote')
    game.submitVote(v2, v3)
    game.submitVote(game.monsterSeatId, v3)
    const events = game.endPhase()
    expect(eventsNamed(events, 'vote:reveal')[0].banishedId).toBe(v3)
    expect(eventsNamed(events, 'game:over')[0]).toMatchObject({ winner: 'monster', endReason: 'outnumbered', rounds: 1 })
  })
})

describe('game over over sockets', () => {
  const HOST_ID = '64b000000000000000000001'
  let harness: SocketHarness
  let clock: ManualClock

  beforeEach(async () => {
    clearRooms()
    clock = new ManualClock()
    harness = await startSocketServer({ clock, random: seededRandom(21) })
  })

  afterEach(async () => {
    clearRooms()
    await harness.close()
  })

  it('reveals votes, ends the game, frees the code, and saves the result', async () => {
    const player = await createUser()
    const code = createRoom(HOST_ID, 'normal').code
    const game = await startGame(harness, () => ({ code, hostToken: signAccessToken(HOST_ID) }), 4)
    // Sign in one phone's seat after the fact, as #29's account rejoin would.
    getRoom(code)!.seats.find((s) => s.seatId === game.seatOf(game.villagers[0]))!.userId = player.id

    clock.advance(30_000 + 10_000 + 30_000 + 60_000)
    await game.host.next('phase:start', (p) => p.phase === 'vote')
    for (const v of game.villagers) await v.send('vote:submit', { targetId: game.seatOf(game.monster) })
    clock.advance(30_000)

    const reveal = await game.host.next('vote:reveal')
    expect(reveal).toMatchObject({ round: 1, banishedId: game.seatOf(game.monster) })
    expect(reveal.votes).toHaveLength(4)
    const over = await game.host.next('game:over')
    expect(over).toMatchObject({ winner: 'villagers', endReason: 'banished', rounds: 1, monster: { seatId: game.seatOf(game.monster) } })
    for (const phone of game.phones) expect(await phone.next('game:over')).toEqual(over)
    expect((await game.host.next('room:state', (s) => s.status === 'ended')).seats).toHaveLength(4)

    // No more phases, and the code is free.
    clock.advance(60_000)
    await game.host.flush()
    expect(game.host.all('phase:start').at(-1)).toMatchObject({ phase: 'vote' })
    expect((await request(harness.url).get(`/api/rooms/${code}`)).status).toBe(404)

    // Saved in the background.
    await expect.poll(() => Game.countDocuments({ roomCode: code })).toBe(1)
    const saved = await Game.findOne({ roomCode: code })
    expect(await GamePlayer.countDocuments({ gameId: saved!._id })).toBe(4)
    await expect.poll(async () => (await User.findById(player.id))!.stats!.villagerWins).toBe(1)
  })
})

describe('runner safety', () => {
  const HOST_ID = '64b000000000000000000001'

  it('logs a failing phase instead of crashing the server', async () => {
    clearRooms()
    const clock = new ManualClock()
    const harness = await startSocketServer({ clock, random: seededRandom(2) })
    try {
      const game = await startGame(harness, () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) }), 4)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(GameEngine.prototype, 'endPhase').mockImplementationOnce(() => {
        throw new Error('engine bug')
      })
      expect(() => clock.advance(30_000)).not.toThrow()
      expect(error).toHaveBeenCalledWith(expect.stringContaining(game.code), expect.any(Error))
      // The server still answers.
      expect((await request(harness.url).get(`/api/rooms/${game.code}`)).status).toBe(200)
      vi.restoreAllMocks()
    } finally {
      clearRooms()
      await harness.close()
    }
  })
})
