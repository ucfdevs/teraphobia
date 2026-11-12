import { deal } from './deal.js'
import type { Costume, MonsterType } from './deal.js'
import { nextPhase } from './phases.js'
import type { Phase } from './phases.js'
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

// Something the socket layer should send: to the whole room, or privately to one seat.
export interface Outbound {
  to: 'room' | { seatId: string }
  event: string
  payload: unknown
}

export type ErrorCode = 'wrong_phase' | 'not_allowed' | 'invalid_target' | 'power_used'

// Why the engine refused a client event. The socket layer sends it as an `error` event.
export interface Rejection {
  code: ErrorCode
  message: string
}

export type NightSubmit = { victimIds: string[] } | { suspectId: string }

export interface Hunch {
  seatId: string
  round: number
  suspectId: string
}

const reject = (code: ErrorCode, message: string): Rejection => ({ code, message })

export class GameEngine {
  readonly players: Player[]
  readonly monsterSeatId: string
  readonly monsterType: MonsterType
  phase: Phase = 'night'
  round = 1
  // Every Villager hunch, for game over.
  readonly hunches: Hunch[] = []
  // Who died in the last Night (for Commune).
  lastNightDeaths: string[] = []
  // This Night's picks; the last submit counts.
  private victimIds: string[] = []
  private suspects = new Map<string, string>()
  // Seats protected from tonight's kill (candles, #26).
  private protectedTonight = new Set<string>()

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

  // Resolves the phase that just ran out and moves to the next one. Phases only end here, on the timer.
  endPhase(): Outbound[] {
    const events: Outbound[] = []
    const ending = this.phase
    if (ending === 'night') events.push(...this.resolveNight())
    this.phase = nextPhase(ending)
    if (ending === 'vote') this.round += 1
    return events
  }

  alive(seatId: string) {
    return this.player(seatId)?.lifeStatus === 'alive'
  }

  livingPlayers() {
    return this.players.filter((p) => p.lifeStatus === 'alive')
  }

  // Checks the sender can act in this phase: a living player, during it.
  private actor(seatId: string, phase: Phase): Player | Rejection {
    if (this.phase !== phase) return reject('wrong_phase', `That can only be done at ${phase}`)
    const player = this.player(seatId)
    if (!player || player.lifeStatus !== 'alive') return reject('not_allowed', 'Only living players can do that')
    return player
  }

  submitNight(seatId: string, submit: NightSubmit): Rejection | null {
    const player = this.actor(seatId, 'night')
    if ('code' in player) return player

    if ('victimIds' in submit) {
      if (player.role !== 'monster') return reject('not_allowed', 'Only the Monster picks a victim')
      if (submit.victimIds.length > 1) return reject('not_allowed', 'Only one victim tonight')
      for (const id of submit.victimIds) {
        if (id === seatId) return reject('invalid_target', 'The Monster cannot pick itself')
        if (!this.alive(id)) return reject('invalid_target', 'Pick a living player')
      }
      this.victimIds = [...submit.victimIds]
      return null
    }

    if (player.role !== 'villager') return reject('not_allowed', 'The Monster picks a victim instead')
    if (submit.suspectId === seatId || !this.alive(submit.suspectId)) return reject('invalid_target', 'Pick another living player')
    this.suspects.set(seatId, submit.suspectId)
    return null
  }

  private resolveNight(): Outbound[] {
    const deadIds = this.victimIds.filter((id) => this.alive(id) && !this.protectedTonight.has(id))
    for (const id of deadIds) this.player(id)!.lifeStatus = 'dead'
    for (const [seatId, suspectId] of this.suspects) this.hunches.push({ seatId, round: this.round, suspectId })

    this.lastNightDeaths = deadIds
    this.victimIds = []
    this.suspects.clear()
    this.protectedTonight.clear()
    return [{ to: 'room', event: 'morning:reveal', payload: { round: this.round, deadIds } }]
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
