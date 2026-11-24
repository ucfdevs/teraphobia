import { deal, OPTIONS, SLOTS } from './deal.js'
import type { Costume, MonsterType, Slot } from './deal.js'
import { nextPhase } from './phases.js'
import type { Phase } from './phases.js'
import { pick } from './random.js'
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
  // The round the player was killed, banished, or removed in.
  diedRound?: number
}

export type Winner = 'villagers' | 'monster'
export type EndReason = 'banished' | 'outnumbered' | 'forfeit'

// The `game:over` payload.
export interface GameOver {
  winner: Winner
  endReason: EndReason
  rounds: number
  monster: { seatId: string; monsterType: MonsterType }
  hunches: Hunch[]
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

// The private `you:result` the searcher gets: one trait the Monster wears (or the Witch's fake).
export interface SearchResult {
  round: number
  action: 'search'
  trait: Trait
}

// `day:options`: what is on today's ballot. Candle always is.
export interface DayOptions {
  round: number
  search: boolean
  commune: boolean
}

// `day:result`: the village's action, shown on the shared screen. A Candle's target is never named.
export interface DayOutcome {
  round: number
  action: DayAction | 'none'
  blocked: boolean
  // Search only: who searched (they got the trait privately).
  searcherId?: string
  // Commune only: a trait the Monster does not have (or the Witch's fake).
  trait?: Trait
}

export interface Hunch {
  seatId: string
  round: number
  suspectId: string
}

const reject = (code: ErrorCode, message: string): Rejection => ({ code, message })

// Rule switches for the balance script (#116). Real games use the defaults.
export interface RuleOptions {
  // Search is off the ballot the day after a Search. Default true.
  searchCooldown?: boolean
}

export class GameEngine {
  readonly players: Player[]
  readonly monsterSeatId: string
  readonly monsterType: MonsterType
  phase: Phase = 'night'
  round = 1
  // Every Villager hunch, for game over.
  readonly hunches: Hunch[] = []
  // Who died in the last Night.
  lastNightDeaths: string[] = []
  // This Night's picks; the last submit counts.
  private victimIds: string[] = []
  private suspects = new Map<string, string>()
  // Seats protected from tonight's kill by the village's Candle.
  private protectedTonight = new Set<string>()
  // This Day's ballots, one per living player; the last submit counts.
  private ballots = new Map<string, DaySubmit>()
  // Who each player voted to protect on the last Day they voted Candle (their own ballot; for rejoins).
  readonly lastCandleTarget = new Map<string, string>()
  // The player the Candle protected last night, who can't be protected again tonight.
  lastProtected: string | null = null
  // The last round whose action was Search (blocked or not): no Search the next day.
  private lastSearchRound = 0
  // The latest `day:result`, for rejoins.
  lastDayOutcome: DayOutcome | null = null
  // Every private Search result each player has received, oldest first (for rejoins).
  readonly results = new Map<string, SearchResult[]>()
  // The Monster's once-per-game power.
  powerUsed = false
  // Vampire or Witch power waiting for today's result.
  private powerPending = false
  // This Vote's ballots: a seat id, or null for Skip. The last submit counts.
  private votes = new Map<string, string | null>()
  // Set once someone wins; the game takes no more events.
  over: GameOver | undefined

  constructor(
    seatIds: string[],
    readonly rng: Rng,
    private readonly rules: RuleOptions = {},
  ) {
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
    if (this.over) return []
    const events: Outbound[] = []
    const ending = this.phase
    if (ending === 'night') events.push(...this.resolveNight())
    if (ending === 'day') events.push(...this.resolveDay())
    if (ending === 'vote') events.push(...this.resolveVote())
    // Win checks run after each Morning reveal and after each vote.
    if (ending === 'morning' || ending === 'vote') events.push(...this.checkWin())
    if (this.over) return events
    this.phase = nextPhase(ending)
    if (ending === 'vote') this.round += 1
    if (this.phase === 'day') events.push({ to: 'room', event: 'day:options', payload: this.dayOptions() })
    return events
  }

  // Ends the game with this result and returns the game:over event.
  end(winner: Winner, endReason: EndReason): Outbound[] {
    this.over = {
      winner,
      endReason,
      rounds: this.round,
      monster: { seatId: this.monsterSeatId, monsterType: this.monsterType },
      hunches: this.hunches.map((h) => ({ ...h })),
    }
    return [{ to: 'room', event: 'game:over', payload: this.over }]
  }

  checkWin(): Outbound[] {
    if (this.over) return []
    if (!this.alive(this.monsterSeatId)) return this.end('villagers', 'banished')
    // Monsters equal Villagers: one Villager left alive.
    if (this.livingPlayers().filter((p) => p.role === 'villager').length <= 1) return this.end('monster', 'outnumbered')
    return []
  }

  // Removes players gone too long, as if killed. A missing Monster forfeits.
  removePlayers(seatIds: string[]): Outbound[] {
    if (this.over) return []
    for (const id of seatIds) if (this.alive(id)) this.takeOut(id, 'dead')
    if (seatIds.includes(this.monsterSeatId)) return this.end('villagers', 'forfeit')
    return this.checkWin()
  }

  // Marks a player out (killed, banished, or removed) in the current round.
  private takeOut(seatId: string, status: 'dead' | 'banished') {
    const player = this.player(seatId)!
    player.lifeStatus = status
    player.diedRound = this.round
  }

  alive(seatId: string) {
    return this.player(seatId)?.lifeStatus === 'alive'
  }

  livingPlayers() {
    return this.players.filter((p) => p.lifeStatus === 'alive')
  }

  // Checks the sender can act in this phase: a living player, during it.
  private actor(seatId: string, phase: Phase): Player | Rejection {
    if (this.over) return reject('wrong_phase', 'The game is over')
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
      if (submit.victimIds.length > 1) {
        const refused = this.werewolfRefusal()
        if (refused) return refused
      }
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

  dayOptions(): DayOptions {
    const cooldown = this.rules.searchCooldown ?? true
    const searchedYesterday = cooldown && this.lastSearchRound > 0 && this.lastSearchRound === this.round - 1
    return { round: this.round, search: !searchedYesterday, commune: true }
  }

  // Every living player votes, the Monster included, so all phones behave the same.
  submitDay(seatId: string, submit: DaySubmit): Rejection | null {
    const player = this.actor(seatId, 'day')
    if ('code' in player) return player
    if (submit.action === 'search' && !this.dayOptions().search) return reject('not_allowed', 'Search isn’t on the ballot the day after a Search')
    if (submit.action === 'candle') {
      const target = submit.targetId
      if (!target || !this.alive(target)) return reject('invalid_target', 'Pick a living player to protect')
      if (target === this.lastProtected) return reject('invalid_target', 'That player was protected last night')
    }
    this.ballots.set(seatId, submit.action === 'candle' ? { action: 'candle', targetId: submit.targetId } : { action: submit.action })
    return null
  }

  // `day:progress`: how many have voted, never what.
  dayProgress() {
    return { round: this.round, voted: [...this.ballots.keys()].filter((id) => this.alive(id)).length, voters: this.livingPlayers().length }
  }

  // Why a double kill isn't allowed tonight, or null if it is.
  private werewolfRefusal(): Rejection | null {
    if (this.monsterType !== 'werewolf') return reject('not_allowed', 'Only one victim tonight')
    if (this.powerUsed) return reject('power_used', 'The power is already used')
    if (this.round === 1) return reject('wrong_phase', 'The Werewolf can’t kill twice on Night 1')
    return null
  }

  submitVote(seatId: string, targetId: string | null): Rejection | null {
    const player = this.actor(seatId, 'vote')
    if ('code' in player) return player
    if (targetId !== null && !this.alive(targetId)) return reject('invalid_target', 'Vote for a living player or Skip')
    this.votes.set(seatId, targetId)
    return null
  }

  // Banishes a player only with more votes than any other option, Skip included. A tie banishes nobody.
  private resolveVote(): Outbound[] {
    const votes = this.livingPlayers().map(({ seatId }) => ({ voterId: seatId, targetId: this.votes.get(seatId) ?? null }))
    const tally = new Map<string | null, number>()
    for (const { targetId } of votes) tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
    const ranked = [...tally].sort((a, b) => b[1] - a[1])
    const [top, runnerUp] = ranked
    const banishedId = top && top[0] !== null && (!runnerUp || top[1] > runnerUp[1]) ? top[0] : null

    if (banishedId) this.takeOut(banishedId, 'banished')
    this.votes.clear()
    return [{ to: 'room', event: 'vote:reveal', payload: { round: this.round, votes, banishedId } }]
  }

  // Vampire and Witch powers, during Day, with no target: they act on today's village action.
  // The Werewolf's double kill goes through night:submit.
  usePower(seatId: string): Rejection | null {
    const player = this.player(seatId)
    if (this.over) return reject('wrong_phase', 'The game is over')
    if (!player || player.role !== 'monster' || player.lifeStatus !== 'alive') return reject('not_allowed', 'Only the Monster has a power')
    if (this.monsterType === 'werewolf') return reject('not_allowed', 'The Werewolf kills twice with night:submit')
    if (this.phase !== 'day') return reject('wrong_phase', 'The power can only be used during Day')
    if (this.powerUsed || this.powerPending) return reject('power_used', 'The power is already used')
    this.powerPending = true
    return null
  }

  private resolveNight(): Outbound[] {
    if (this.victimIds.length > 1) this.powerUsed = true
    const deadIds = this.victimIds.filter((id) => this.alive(id) && !this.protectedTonight.has(id))
    for (const id of deadIds) this.takeOut(id, 'dead')
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

  // The option with the most votes; ties are broken at random. Undefined when there are none.
  private plurality<T>(votes: T[]): T | undefined {
    const tally = new Map<T, number>()
    for (const vote of votes) tally.set(vote, (tally.get(vote) ?? 0) + 1)
    const top = Math.max(0, ...tally.values())
    const leaders = [...tally].filter(([, n]) => n === top).map(([vote]) => vote)
    return leaders.length > 0 ? pick(this.rng, leaders) : undefined
  }

  private resolveDay(): Outbound[] {
    const round = this.round
    const ballots = [...this.ballots].filter(([id]) => this.alive(id))
    const action = this.plurality(ballots.map(([, b]) => b.action)) ?? 'none'
    const acted = action !== 'none'
    const blocked = acted && this.powerPending && this.monsterType === 'vampire'
    // The Witch fakes a Search or Commune; on a Candle day or a day with no action, she keeps the power.
    const faked = this.powerPending && this.monsterType === 'witch' && (action === 'search' || action === 'commune')
    if (blocked || faked) this.powerUsed = true
    this.powerPending = false

    const outcome: DayOutcome = { round, action, blocked }
    const events: Outbound[] = []
    let protectedId: string | null = null

    if (action === 'search') {
      this.lastSearchRound = round
      if (!blocked) {
        // One Villager who voted Search, or any living Villager if none did.
        const voters = ballots.filter(([id, b]) => b.action === 'search' && this.player(id)!.role === 'villager').map(([id]) => id)
        const searcherId = pick(this.rng, voters.length > 0 ? voters : this.livingPlayers().filter((p) => p.role === 'villager').map((p) => p.seatId))
        const result: SearchResult = { round, action: 'search', trait: faked ? this.notMonsterTrait() : this.monsterTrait() }
        this.results.set(searcherId, [...(this.results.get(searcherId) ?? []), result])
        outcome.searcherId = searcherId
        events.push({ to: { seatId: searcherId }, event: 'you:result', payload: result })
      }
    } else if (action === 'commune' && !blocked) {
      // The Witch names one of her own traits as one the Monster lacks.
      outcome.trait = faked ? this.monsterTrait() : this.notMonsterTrait()
    } else if (action === 'candle' && !blocked) {
      protectedId = this.plurality(ballots.filter(([, b]) => b.action === 'candle').map(([, b]) => b.targetId!)) ?? null
      if (protectedId) this.protectedTonight.add(protectedId)
    }
    this.lastProtected = protectedId

    for (const [id, b] of ballots) {
      if (b.action === 'candle') this.lastCandleTarget.set(id, b.targetId!)
      else this.lastCandleTarget.delete(id)
    }
    this.ballots.clear()
    this.lastDayOutcome = outcome

    // Public result first, then the searcher's private trait, then the Monster's real power state.
    return [
      { to: 'room', event: 'day:result', payload: outcome },
      ...events,
      { to: { seatId: this.monsterSeatId }, event: 'you:power', payload: { powerUsed: this.powerUsed } },
    ]
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
