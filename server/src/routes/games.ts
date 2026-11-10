import { Router } from 'express'
import type { Request, Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { requireAuth } from '../middleware/requireAuth.js'
import { Game } from '../models/game.js'
import { GamePlayer } from '../models/gamePlayer.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// Parses a positive integer query value; undefined falls back, anything else is null.
function positiveInt(value: unknown, fallback: number) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const n = Number(value)
  return n >= 1 ? n : null
}

interface HistoryRow {
  role: string
  outcome: string
  game: {
    _id: Types.ObjectId
    startedAt: Date
    endedAt: Date
    playerCount: number
    monsterType: string
    winner: string
  }
}

// GET /users/me/games: the signed-in user's games, newest first.
export async function myGames(req: Request, res: Response) {
  const page = positiveInt(req.query.page, 1)
  const requestedLimit = positiveInt(req.query.limit, DEFAULT_LIMIT)
  if (page === null || requestedLimit === null) {
    res.status(400).json({ error: 'page and limit must be positive integers' })
    return
  }
  const limit = Math.min(requestedLimit, MAX_LIMIT)
  const userId = new Types.ObjectId(req.userId)

  const [result] = await GamePlayer.aggregate<{ total: { n: number }[]; rows: HistoryRow[] }>([
    { $match: { userId } },
    { $lookup: { from: Game.collection.name, localField: 'gameId', foreignField: '_id', as: 'game' } },
    { $unwind: '$game' },
    { $sort: { 'game.endedAt': -1, 'game._id': -1 } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        rows: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { role: 1, outcome: 1, game: 1 } }],
      },
    },
  ])

  const gameIds = result.rows.map((row) => row.game._id)
  const seats = await GamePlayer.find({ gameId: { $in: gameIds } }, { gameId: 1, displayName: 1 }).sort({ _id: 1 }).lean()
  const playersByGame = new Map<string, string[]>()
  for (const seat of seats) {
    const key = seat.gameId.toString()
    playersByGame.set(key, [...(playersByGame.get(key) ?? []), seat.displayName])
  }

  res.json({
    page,
    limit,
    total: result.total[0]?.n ?? 0,
    games: result.rows.map(({ game, role, outcome }) => ({
      id: game._id.toString(),
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      playerCount: game.playerCount,
      players: playersByGame.get(game._id.toString()) ?? [],
      monsterType: game.monsterType,
      winner: game.winner,
      role,
      outcome,
    })),
  })
}

// GET /games/:id: one game, only for someone who played in it.
async function gameDetails(req: Request<{ id: string }>, res: Response) {
  const { id } = req.params
  const me = isValidObjectId(id) ? await GamePlayer.findOne({ gameId: id, userId: req.userId }) : null
  const game = me && (await Game.findById(id))
  if (!me || !game) {
    res.status(404).json({ error: 'Game not found' })
    return
  }

  const players = await GamePlayer.find({ gameId: game._id }).sort({ _id: 1 })
  // Other players' account ids stay private.
  res.json({
    id: game.id,
    roomCode: game.roomCode,
    preset: game.preset,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    playerCount: game.playerCount,
    monsterType: game.monsterType,
    winner: game.winner,
    endReason: game.endReason,
    rounds: game.rounds,
    players: players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      costume: player.costume,
      role: player.role,
      outcome: player.outcome,
      diedRound: player.diedRound ?? null,
      nightHunches: player.nightHunches.map((hunch) => hunch.toString()),
      isYou: player.id === me.id,
    })),
  })
}

export function createGamesRouter() {
  const router = Router()
  router.use(requireAuth)
  router.get('/:id', gameDetails)
  return router
}
