import { deal, OPTIONS, SLOTS } from './deal.js'
import type { Costume, MonsterType, Slot } from './deal.js'
import { nextPhase } from './phases.js'
import type { Phase } from './phases.js'
import { pick, shuffle } from './random.js'
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

export type DayAction = 'search' | 'commune' | 'candle'
export interface DaySubmit {
  action: DayAction
  targetId?: string
}

export interface Trait {
  slot: Slot
  option: string
}

// A private `you:result`. Search and Commune carry a trait (null when nothing was found); Candle carries candleBlocked.
export type DayResult =
  | { round: number; action: 'search' | 'commune'; trait: Trait | null }
  | { round: number; action: 'candle'; candleBlocked: boolean }

// Successful Searches and Communes per Day (PRD; the balance script may raise Search to 3 at 7 to 8 players).
export const SEARCH_CAP = 2
export const COMMUNE_CAP = 2
// Even a successful Search finds nothing this often, so empty Searches don't point at a Vampire.
export const EMPTY_SEARCH_CHANCE = 0.2

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
  // Seats protected from tonight's kill by candles lit during Day.
  private protectedTonight = new Set<string>()
  // This Day's actions; the last submit counts.
  private dayActions = new Map<string, DaySubmit>()
  // Who each player lit a candle for last Day (no same target two nights in a row).
  readonly lastCandleTarget = new Map<string, string>()
  // Every private Day result each player has received, oldest first (for rejoins).
  readonly results = new Map<string, DayResult[]>()

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
    if (ending === 'day') events.push(...this.resolveDay())
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

  submitDay(seatId: string, submit: DaySubmit): Rejection | null {
    const player = this.actor(seatId, 'day')
    if ('code' in player) return player
    if (player.role !== 'villager') return reject('not_allowed', 'The Monster takes no Day action')

    if (submit.action === 'candle') {
      const target = submit.targetId
      if (!target || target === seatId) return reject('invalid_target', 'Light a candle for another player')
      if (!this.alive(target)) return reject('invalid_target', 'Pick a living player')
      if (this.lastCandleTarget.get(seatId) === target) {
        return reject('invalid_target', 'You can’t protect the same player two nights in a row')
      }
    }
    this.dayActions.set(seatId, { ...submit })
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

  private monsterTrait(): Trait {
    const slot = pick(this.rng, SLOTS)
    return { slot, option: this.player(this.monsterSeatId)!.costume[slot] }
  }

  // One of the 9 traits the Monster does not have.
  private notMonsterTrait(): Trait {
    const slot = pick(this.rng, SLOTS)
    const monsterOption = this.player(this.monsterSeatId)!.costume[slot]
    return { slot, option: pick(this.rng, OPTIONS[slot].filter((o) => o !== monsterOption)) }
  }

  private resolveDay(): Outbound[] {
    const round = this.round
    const results = new Map<string, DayResult>()
    const takers = (action: DayAction) => shuffle(this.rng, [...this.dayActions].filter(([, a]) => a.action === action).map(([id]) => id))

    // Searches: up to SEARCH_CAP random searchers succeed; the rest find nothing.
    takers('search').forEach((seatId, i) => {
      const found = i < SEARCH_CAP && this.rng() >= EMPTY_SEARCH_CHANCE
      results.set(seatId, { round, action: 'search', trait: found ? this.monsterTrait() : null })
    })

    // Communes: up to COMMUNE_CAP succeed, and only if someone died last night.
    const spirits = this.lastNightDeaths.length > 0
    takers('commune').forEach((seatId, i) => {
      results.set(seatId, { round, action: 'commune', trait: spirits && i < COMMUNE_CAP ? this.notMonsterTrait() : null })
    })

    // Candles: protect their target tonight. A save is never reported.
    this.lastCandleTarget.clear()
    for (const [seatId, action] of this.dayActions) {
      if (action.action !== 'candle') continue
      this.protectedTonight.add(action.targetId!)
      this.lastCandleTarget.set(seatId, action.targetId!)
      results.set(seatId, { round, action: 'candle', candleBlocked: false })
    }

    this.dayActions.clear()
    // Seat order, so nothing about the shuffle leaks through timing.
    return this.players.flatMap(({ seatId }) => {
      const result = results.get(seatId)
      if (!result) return []
      this.results.set(seatId, [...(this.results.get(seatId) ?? []), result])
      return [{ to: { seatId }, event: 'you:result', payload: result }]
    })
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
