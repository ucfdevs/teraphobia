import mongoose from 'mongoose'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { finishGame, saveFinishedGame } from '../src/games/results.js'
import type { FinishedGame, FinishedSeat } from '../src/games/results.js'
import { Game } from '../src/models/game.js'
import { GamePlayer } from '../src/models/gamePlayer.js'
import { User } from '../src/models/user.js'
import { bearer, createUser } from './helpers.js'

let roomCounter = 0

function seat(seatId: string, extra: Partial<FinishedSeat> = {}): FinishedSeat {
  return { seatId, displayName: `Name ${seatId}`, costume: { hat: `${seatId}-hat`, mask: `${seatId}-mask`, item: `${seatId}-item` }, ...extra }
}

// Seat s1 is the Monster unless told otherwise.
function finishedGame(seats: FinishedSeat[], result: Partial<FinishedGame['result']> = {}): FinishedGame {
  roomCounter += 1
  return {
    roomCode: `R${String(roomCounter).padStart(3, 'A')}`.slice(0, 4),
    hostUserId: new mongoose.Types.ObjectId().toString(),
    preset: 'normal',
    startedAt: new Date('2026-11-12T20:00:00Z'),
    endedAt: new Date('2026-11-12T20:15:00Z'),
    seats,
    result: { winner: 'monster', endReason: 'outnumbered', rounds: 3, monster: { seatId: 's1', monsterType: 'witch' }, hunches: [], ...result },
  }
}

async function stats(userId: string) {
  return (await User.findById(userId).lean())!.stats
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveFinishedGame', () => {
  it('writes 1 games document and 1 gamePlayers document per seat', async () => {
    const game = finishedGame([seat('s1'), seat('s2', { diedRound: 2 }), seat('s3'), seat('s4'), seat('s5')], {
      winner: 'villagers',
      endReason: 'banished',
      hunches: [
        { seatId: 's3', round: 2, suspectId: 's1' },
        { seatId: 's3', round: 1, suspectId: 's2' },
        { seatId: 's4', round: 1, suspectId: 's1' },
      ],
    })

    expect(await saveFinishedGame(game)).toBe(true)

    const games = await Game.find({ roomCode: game.roomCode }).lean()
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      preset: 'normal',
      playerCount: 5,
      monsterType: 'witch',
      winner: 'villagers',
      endReason: 'banished',
      rounds: 3,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
    })
    expect(games[0].hostUserId.toString()).toBe(game.hostUserId)

    const players = await GamePlayer.find({ gameId: games[0]._id }).lean()
    expect(players).toHaveLength(5)
    const byName = Object.fromEntries(players.map((p) => [p.displayName, p]))
    expect(byName['Name s1']).toMatchObject({ role: 'monster', outcome: 'lost', costume: { hat: 's1-hat', mask: 's1-mask', item: 's1-item' } })
    expect(byName['Name s2']).toMatchObject({ role: 'villager', outcome: 'won', diedRound: 2 })
    // Hunches point at the suspects' gamePlayers documents, in round order.
    expect(byName['Name s3'].nightHunches.map(String)).toEqual([byName['Name s2']._id.toString(), byName['Name s1']._id.toString()])
    expect(byName['Name s4'].nightHunches.map(String)).toEqual([byName['Name s1']._id.toString()])
    expect(byName['Name s5'].nightHunches).toEqual([])
  })

  it('a Monster win as Witch bumps that user’s witch wins; losing Villagers only get a game played', async () => {
    const monster = await createUser()
    const villager = await createUser()
    const game = finishedGame([
      seat('s1', { userId: monster.id }),
      seat('s2', { userId: villager.id }),
      seat('s3'),
      seat('s4'),
    ])

    expect(await saveFinishedGame(game)).toBe(true)

    expect(await stats(monster.id)).toEqual({ gamesPlayed: 1, villagerWins: 0, monsterWins: { vampire: 0, witch: 1, werewolf: 0 } })
    expect(await stats(villager.id)).toEqual({ gamesPlayed: 1, villagerWins: 0, monsterWins: { vampire: 0, witch: 0, werewolf: 0 } })
  })

  it('a Villager win bumps villagerWins and adds up across games', async () => {
    const villager = await createUser()
    const monster = await createUser()
    const seats = () => [seat('s1', { userId: monster.id }), seat('s2', { userId: villager.id }), seat('s3'), seat('s4')]

    await saveFinishedGame(finishedGame(seats(), { winner: 'villagers', endReason: 'banished', monster: { seatId: 's1', monsterType: 'werewolf' } }))
    await saveFinishedGame(finishedGame(seats(), { winner: 'villagers', endReason: 'forfeit', monster: { seatId: 's1', monsterType: 'vampire' } }))

    expect(await stats(villager.id)).toEqual({ gamesPlayed: 2, villagerWins: 2, monsterWins: { vampire: 0, witch: 0, werewolf: 0 } })
    expect(await stats(monster.id)).toEqual({ gamesPlayed: 2, villagerWins: 0, monsterWins: { vampire: 0, witch: 0, werewolf: 0 } })
  })

  it('saves guests with no userId and touches no stats', async () => {
    const before = await User.find().lean()
    const game = finishedGame([seat('s1'), seat('s2'), seat('s3'), seat('s4')])

    expect(await saveFinishedGame(game)).toBe(true)

    const gameDoc = await Game.findOne({ roomCode: game.roomCode })
    const players = await GamePlayer.find({ gameId: gameDoc!._id }).lean()
    expect(players).toHaveLength(4)
    for (const player of players) expect(player).not.toHaveProperty('userId')
    expect(await User.find().lean()).toEqual(before)
  })

  it('counts an account once even if it held two seats', async () => {
    const user = await createUser()
    await saveFinishedGame(finishedGame([seat('s1'), seat('s2', { userId: user.id }), seat('s3', { userId: user.id }), seat('s4')]))
    expect((await stats(user.id)).gamesPlayed).toBe(1)
  })

  it('saves a seat with a malformed userId as a guest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = finishedGame([seat('s1'), seat('s2', { userId: 'not-an-id' }), seat('s3'), seat('s4')])
    expect(await saveFinishedGame(game)).toBe(true)
    const gameDoc = await Game.findOne({ roomCode: game.roomCode })
    expect(await GamePlayer.countDocuments({ gameId: gameDoc!._id, userId: { $exists: true } })).toBe(0)
  })

  it('logs and returns false, without throwing, when the Monster seat is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const game = finishedGame([seat('s2'), seat('s3'), seat('s4'), seat('s5')])
    expect(await saveFinishedGame(game)).toBe(false)
    expect(error).toHaveBeenCalled()
    expect(await Game.countDocuments({ roomCode: game.roomCode })).toBe(0)
  })

  it('shows up in the player’s history', async () => {
    const user = await createUser()
    const game = finishedGame([seat('s1', { userId: user.id }), seat('s2'), seat('s3'), seat('s4')])
    await saveFinishedGame(game)

    const res = await request(createApp()).get('/api/users/me/games').set('Authorization', bearer(user))
    expect(res.body.total).toBe(1)
    expect(res.body.games[0]).toMatchObject({ monsterType: 'witch', winner: 'monster', role: 'monster', outcome: 'won', playerCount: 4 })
  })
})

describe('finishGame', () => {
  it('emits game:over before saving', async () => {
    const order: string[] = []
    const create = Game.create.bind(Game)
    vi.spyOn(Game, 'create').mockImplementation(((...args: Parameters<typeof Game.create>) => {
      order.push('save')
      return create(...args)
    }) as typeof Game.create)
    const game = finishedGame([seat('s1'), seat('s2'), seat('s3'), seat('s4')])

    const saved = finishGame(game, (payload) => {
      order.push('emit')
      expect(payload).toEqual(game.result)
    })

    expect(await saved).toBe(true)
    expect(order).toEqual(['emit', 'save'])
  })

  it('still emits game:over, and never throws, when a write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(GamePlayer, 'insertMany').mockRejectedValue(new Error('write failed'))
    const emit = vi.fn()

    const saved = finishGame(finishedGame([seat('s1'), seat('s2'), seat('s3'), seat('s4')]), emit)

    expect(emit).toHaveBeenCalledTimes(1)
    await expect(saved).resolves.toBe(false)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not save game'), expect.any(Error))
  })
})

// Last, since it takes the real connection down and brings it back.
describe('with the database down', () => {
  it('still emits game:over and the save fails quietly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { host, port, name } = mongoose.connection
    const uri = `mongodb://${host}:${port}`
    mongoose.set('bufferTimeoutMS', 200)
    await mongoose.disconnect()
    try {
      const emit = vi.fn()
      const saved = finishGame(finishedGame([seat('s1'), seat('s2'), seat('s3'), seat('s4')]), emit)

      expect(emit).toHaveBeenCalledTimes(1)
      await expect(saved).resolves.toBe(false)
      expect(error).toHaveBeenCalled()
    } finally {
      mongoose.set('bufferTimeoutMS', 10_000)
      await mongoose.connect(uri, { dbName: name })
    }
  })
})
