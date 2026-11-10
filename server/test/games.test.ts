import { Types } from 'mongoose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { Game } from '../src/models/game.js'
import { GamePlayer } from '../src/models/gamePlayer.js'
import { bearer, createUser } from './helpers.js'

const app = createApp()

type Seat = { userId?: Types.ObjectId; displayName: string; role?: 'villager' | 'monster'; outcome?: 'won' | 'lost' }

// Saves a finished game and its seats; the first seat is the Monster unless roles are given.
async function saveGame(endedAt: Date, seats: Seat[]) {
  const game = await Game.create({
    roomCode: 'ABCD',
    hostUserId: new Types.ObjectId(),
    preset: 'normal',
    startedAt: new Date(endedAt.getTime() - 20 * 60_000),
    endedAt,
    playerCount: seats.length,
    monsterType: 'witch',
    winner: 'villagers',
    endReason: 'banished',
    rounds: 3,
  })
  const players = await GamePlayer.insertMany(
    seats.map((seat, i) => ({
      gameId: game._id,
      costume: { hat: `hat${i}`, mask: `mask${i}`, item: `item${i}` },
      role: i === 0 ? 'monster' : 'villager',
      outcome: i === 0 ? 'lost' : 'won',
      ...seat,
    })),
  )
  return { game, players }
}

function guests(n: number): Seat[] {
  return Array.from({ length: n }, (_, i) => ({ displayName: `Guest ${i}` }))
}

describe('GET /api/users/me/games', () => {
  it('lists my games newest first with players, Monster, winner, and my outcome', async () => {
    const me = await createUser()
    const older = await saveGame(new Date('2026-10-01'), [{ userId: me._id, displayName: 'Me' }, ...guests(3)])
    const newer = await saveGame(new Date('2026-11-01'), [...guests(1), { userId: me._id, displayName: 'Me' }, ...guests(3)])
    await saveGame(new Date('2026-11-05'), guests(4))

    const res = await request(app).get('/api/users/me/games').set('Authorization', bearer(me))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 })
    expect(res.body.games.map((g: { id: string }) => g.id)).toEqual([newer.game.id, older.game.id])
    expect(res.body.games[0]).toEqual({
      id: newer.game.id,
      startedAt: newer.game.startedAt.toISOString(),
      endedAt: newer.game.endedAt.toISOString(),
      playerCount: 5,
      players: ['Guest 0', 'Me', 'Guest 0', 'Guest 1', 'Guest 2'],
      monsterType: 'witch',
      winner: 'villagers',
      role: 'villager',
      outcome: 'won',
    })
    expect(res.body.games[1]).toMatchObject({ role: 'monster', outcome: 'lost' })
  })

  it('pages correctly and caps limit at 50', async () => {
    const me = await createUser()
    for (let day = 1; day <= 5; day += 1) {
      await saveGame(new Date(`2026-09-0${day}`), [{ userId: me._id, displayName: `Me ${day}` }, ...guests(3)])
    }
    const auth = bearer(me)

    const page2 = await request(app).get('/api/users/me/games?page=2&limit=2').set('Authorization', auth)
    expect(page2.body).toMatchObject({ page: 2, limit: 2, total: 5 })
    expect(page2.body.games.map((g: { players: string[] }) => g.players[0])).toEqual(['Me 3', 'Me 2'])

    const page3 = await request(app).get('/api/users/me/games?page=3&limit=2').set('Authorization', auth)
    expect(page3.body.games.map((g: { players: string[] }) => g.players[0])).toEqual(['Me 1'])

    const capped = await request(app).get('/api/users/me/games?limit=500').set('Authorization', auth)
    expect(capped.body.limit).toBe(50)
  })

  it('returns an empty list for a user with no games', async () => {
    const res = await request(app).get('/api/users/me/games').set('Authorization', bearer(await createUser()))
    expect(res.body).toEqual({ page: 1, limit: 20, total: 0, games: [] })
  })

  it('returns 400 for a bad page or limit', async () => {
    const auth = bearer(await createUser())
    for (const query of ['page=0', 'page=abc', 'limit=-1', 'limit=1.5', 'page=1000000000000000000']) {
      expect((await request(app).get(`/api/users/me/games?${query}`).set('Authorization', auth)).status).toBe(400)
    }
  })

  it('returns 401 with no token', async () => {
    expect((await request(app).get('/api/users/me/games')).status).toBe(401)
  })
})

describe('GET /api/games/:id', () => {
  it('returns the game and every seat to a player who played it', async () => {
    const me = await createUser()
    const other = await createUser()
    const { game, players } = await saveGame(new Date('2026-11-01'), [
      { userId: other._id, displayName: 'Other' },
      { userId: me._id, displayName: 'Me' },
      ...guests(2),
    ])
    await GamePlayer.updateOne({ _id: players[1]._id }, { nightHunches: [players[0]._id], diedRound: 2 })

    const res = await request(app).get(`/api/games/${game.id}`).set('Authorization', bearer(me))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: game.id,
      preset: 'normal',
      playerCount: 4,
      monsterType: 'witch',
      winner: 'villagers',
      endReason: 'banished',
      rounds: 3,
    })
    expect(res.body.players).toHaveLength(4)
    expect(res.body.players[1]).toEqual({
      id: players[1].id,
      displayName: 'Me',
      costume: { hat: 'hat1', mask: 'mask1', item: 'item1' },
      role: 'villager',
      outcome: 'won',
      diedRound: 2,
      nightHunches: [players[0].id],
      isYou: true,
    })
    expect(res.body.players[0].isYou).toBe(false)
    expect(JSON.stringify(res.body)).not.toContain(other.id)
    expect(res.body).not.toHaveProperty('hostUserId')
  })

  it("returns 404 for a game the user didn't play", async () => {
    const { game } = await saveGame(new Date(), guests(4))
    const res = await request(app).get(`/api/games/${game.id}`).set('Authorization', bearer(await createUser()))
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('returns 404 for an unknown or malformed id', async () => {
    const auth = bearer(await createUser())
    expect((await request(app).get(`/api/games/${new Types.ObjectId()}`).set('Authorization', auth)).status).toBe(404)
    expect((await request(app).get('/api/games/not-an-id').set('Authorization', auth)).status).toBe(404)
  })

  it('returns 401 with no token', async () => {
    const { game } = await saveGame(new Date(), guests(4))
    expect((await request(app).get(`/api/games/${game.id}`)).status).toBe(401)
  })
})
