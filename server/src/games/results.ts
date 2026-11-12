import { isValidObjectId, Types } from 'mongoose'
import { Game } from '../models/game.js'
import type { Preset } from '../models/game.js'
import { GamePlayer } from '../models/gamePlayer.js'
import { User } from '../models/user.js'

// Saves finished games (FR-13) and bumps signed-in players' stats (FR-16).
// The game engine calls finishGame on a win; nothing here may crash the server or hold up `game:over`.

type MonsterType = 'vampire' | 'witch' | 'werewolf'

// The `game:over` payload, as in shared/schemas/server/game-over.schema.json.
export interface GameOverPayload {
  winner: 'villagers' | 'monster'
  endReason: 'banished' | 'outnumbered' | 'forfeit'
  rounds: number
  monster: { seatId: string; monsterType: MonsterType }
  hunches: { seatId: string; round: number; suspectId: string }[]
}

export interface FinishedSeat {
  seatId: string
  displayName: string
  costume: { hat: string; mask: string; item: string }
  // Signed-in players only; guests have none.
  userId?: string
  // The round the player died or was banished in, if they did.
  diedRound?: number
}

export interface FinishedGame {
  roomCode: string
  hostUserId: string
  preset: Preset
  startedAt: Date
  endedAt: Date
  // Every seat dealt in at Start, including players who died or dropped.
  seats: FinishedSeat[]
  result: GameOverPayload
}

// Emits `game:over` first, then saves in the background, so a slow or failed write never delays clients.
// Returns the save so callers (and tests) can wait on it if they want; it never rejects.
export function finishGame(game: FinishedGame, emitGameOver: (payload: GameOverPayload) => void) {
  emitGameOver(game.result)
  return saveFinishedGame(game)
}

// Writes 1 games document, 1 gamePlayers document per seat, and the stats. Logs and returns false on failure.
export async function saveFinishedGame(game: FinishedGame): Promise<boolean> {
  try {
    const { result, seats } = game
    if (!seats.some((seat) => seat.seatId === result.monster.seatId)) {
      throw new Error(`Monster seat ${result.monster.seatId} is not in the game`)
    }

    // Ids are made up front so night hunches can point at other players' documents.
    const playerIds = new Map(seats.map((seat) => [seat.seatId, new Types.ObjectId()]))

    const savedGame = await Game.create({
      roomCode: game.roomCode,
      hostUserId: game.hostUserId,
      preset: game.preset,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      playerCount: seats.length,
      monsterType: result.monster.monsterType,
      winner: result.winner,
      endReason: result.endReason,
      rounds: result.rounds,
    })

    const players = seats.map((seat) => {
      const role = seat.seatId === result.monster.seatId ? 'monster' : 'villager'
      const won = (role === 'monster') === (result.winner === 'monster')
      const nightHunches = result.hunches
        .filter((hunch) => hunch.seatId === seat.seatId)
        .sort((a, b) => a.round - b.round)
        .map((hunch) => playerIds.get(hunch.suspectId))
        .filter((id): id is Types.ObjectId => id !== undefined)
      return {
        _id: playerIds.get(seat.seatId),
        gameId: savedGame._id,
        userId: signedInUserId(seat),
        displayName: seat.displayName,
        costume: seat.costume,
        role,
        outcome: won ? 'won' : 'lost',
        diedRound: seat.diedRound,
        nightHunches,
      } as const
    })
    await GamePlayer.insertMany(players)

    // One update per account, even if the same account somehow held two seats.
    const statUpdates = new Map<string, Record<string, number>>()
    for (const player of players) {
      if (!player.userId || statUpdates.has(player.userId)) continue
      const inc: Record<string, number> = { 'stats.gamesPlayed': 1 }
      if (player.outcome === 'won') {
        inc[player.role === 'monster' ? `stats.monsterWins.${result.monster.monsterType}` : 'stats.villagerWins'] = 1
      }
      statUpdates.set(player.userId, inc)
    }
    if (statUpdates.size > 0) {
      await User.bulkWrite(
        [...statUpdates].map(([userId, inc]) => ({ updateOne: { filter: { _id: userId }, update: { $inc: inc } } })),
        { ordered: false },
      )
    }
    return true
  } catch (err) {
    console.error(`Could not save game ${game.roomCode}`, err)
    return false
  }
}

function signedInUserId(seat: FinishedSeat) {
  if (seat.userId === undefined) return undefined
  if (isValidObjectId(seat.userId)) return seat.userId
  console.warn(`Saving seat ${seat.seatId} as a guest: bad userId ${seat.userId}`)
  return undefined
}
