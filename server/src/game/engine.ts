import { deal } from './deal.js'
import type { Costume, MonsterType } from './deal.js'
import type { Rng } from './random.js'

// The pure game engine: all rules and state, no sockets or timers. The socket layer feeds it events and
// sends what it returns.

export type Role = 'villager' | 'monster'
export type LifeStatus = 'alive' | 'dead' | 'banished'

export interface Player {
  seatId: string
  costume: Costume
  role: Role
  lifeStatus: LifeStatus
}

export class GameEngine {
  readonly players: Player[]
  readonly monsterSeatId: string
  readonly monsterType: MonsterType

  constructor(seatIds: string[], readonly rng: Rng) {
    const { costumes, monsterIndex, monsterType } = deal(seatIds.length, rng)
    this.players = seatIds.map((seatId, i) => ({
      seatId,
      costume: costumes[i],
      role: i === monsterIndex ? 'monster' : 'villager',
      lifeStatus: 'alive',
    }))
    this.monsterSeatId = seatIds[monsterIndex]
    this.monsterType = monsterType
  }

  player(seatId: string) {
    return this.players.find((p) => p.seatId === seatId)
  }

  // The private `you:role` payload. Only the Monster's includes monsterType.
  youRole(seatId: string) {
    const player = this.player(seatId)
    if (!player) throw new Error(`No player ${seatId}`)
    const base = { seatId, role: player.role, costume: { ...player.costume } }
    return player.role === 'monster' ? { ...base, monsterType: this.monsterType } : base
  }
}
