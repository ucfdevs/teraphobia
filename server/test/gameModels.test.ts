import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { Game } from '../src/models/game.js'
import { GamePlayer } from '../src/models/gamePlayer.js'

const validGame = () => ({
  roomCode: 'ABCD',
  hostUserId: new Types.ObjectId(),
  preset: 'normal',
  startedAt: new Date(),
  endedAt: new Date(),
  playerCount: 5,
  monsterType: 'witch',
  winner: 'monster',
  endReason: 'outnumbered',
  rounds: 3,
})

const validPlayer = () => ({
  gameId: new Types.ObjectId(),
  displayName: 'Guest',
  costume: { hat: 'witch-hat', mask: 'skull', item: 'lantern' },
  role: 'villager',
  outcome: 'lost',
})

describe('Game model', () => {
  it('saves a valid game', async () => {
    await expect(Game.create(validGame())).resolves.toBeTruthy()
  })

  it.each([['preset', 'slow'], ['monsterType', 'ghost'], ['winner', 'nobody'], ['endReason', 'boredom']])(
    'rejects an invalid %s',
    async (field, value) => {
      await expect(new Game({ ...validGame(), [field]: value }).validate()).rejects.toThrow(field)
    },
  )
})

describe('GamePlayer model', () => {
  it('saves a guest with no userId', async () => {
    const player = await GamePlayer.create(validPlayer())
    expect(player.userId).toBeUndefined()
  })

  it.each([['role', 'ghost'], ['outcome', 'draw']])('rejects an invalid %s', async (field, value) => {
    await expect(new GamePlayer({ ...validPlayer(), [field]: value }).validate()).rejects.toThrow(field)
  })

  it('has indexes on userId and gameId', async () => {
    const keys = (await GamePlayer.collection.indexes()).map((index) => index.key)
    expect(keys).toContainEqual({ userId: 1 })
    expect(keys).toContainEqual({ gameId: 1 })
  })
})
