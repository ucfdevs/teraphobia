import { GameEngine } from '../src/game/engine.js'
import type { Phase } from '../src/game/phases.js'
import { seededRandom } from '../src/game/random.js'

export const SEATS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

// A game whose Monster has the given type (seeds are tried until one fits).
export function engineWith(players: number, monsterType?: 'vampire' | 'witch' | 'werewolf', seed = 1) {
  for (let s = seed; s < seed + 1000; s += 1) {
    const game = new GameEngine(SEATS.slice(0, players), seededRandom(s))
    if (!monsterType || game.monsterType === monsterType) return game
  }
  throw new Error(`No seed gives a ${monsterType}`)
}

export function villagerIds(game: GameEngine) {
  return game.players.filter((p) => p.role === 'villager').map((p) => p.seatId)
}

// Ends phases until the game reaches this phase (and round, if given).
export function advanceTo(game: GameEngine, phase: Phase, round = game.round) {
  for (let i = 0; i < 50; i += 1) {
    if (game.phase === phase && game.round === round) return
    game.endPhase()
  }
  throw new Error(`Never reached ${phase} ${round}`)
}

export function eventsNamed(events: { event: string; payload: unknown }[], name: string) {
  return events.filter((e) => e.event === name).map((e) => e.payload as any)
}
