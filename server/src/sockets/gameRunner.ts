import { phaseDurationMs } from '../game/phases.js'
import type { Outbound } from '../game/engine.js'
import type { Room } from '../rooms/store.js'
import type { Clock } from './clock.js'
import type { ServerEvent } from './schemas.js'

// What a runner needs from the socket server: time, and a way to reach the room or one seat's phone.
export interface RunnerContext {
  clock: Clock
  toRoom(room: Room, event: ServerEvent, payload: unknown): void
  toSeat(room: Room, seatId: string, event: ServerEvent, payload: unknown): void
  // Sends the public room:state, for deaths and status changes.
  broadcastState(room: Room): void
}

// Owns the real timer for one room's game: starts each phase, and when its time is up asks the engine to
// resolve it. The engine itself never sees a clock.
export class GameRunner {
  endsAt = 0
  private timer: unknown

  constructor(
    private readonly ctx: RunnerContext,
    private readonly room: Room,
  ) {}

  private get game() {
    return this.room.game!
  }

  start() {
    this.startPhase()
  }

  stop() {
    if (this.timer !== undefined) this.ctx.clock.clearTimeout(this.timer)
    this.timer = undefined
  }

  // The current phase:start payload (also used for rejoins).
  phaseStart() {
    return { phase: this.game.phase, round: this.game.round, endsAt: this.endsAt, serverNow: this.ctx.clock.now() }
  }

  send(events: Outbound[]) {
    for (const { to, event, payload } of events) {
      if (to === 'room') this.ctx.toRoom(this.room, event as ServerEvent, payload)
      else this.ctx.toSeat(this.room, to.seatId, event as ServerEvent, payload)
    }
  }

  private startPhase() {
    const duration = phaseDurationMs(this.game.phase, this.room.preset)
    this.endsAt = this.ctx.clock.now() + duration
    this.schedule(duration)
    this.send([{ to: 'room', event: 'phase:start', payload: this.phaseStart() }])
  }

  private schedule(ms: number) {
    this.stop()
    this.timer = this.ctx.clock.setTimeout(() => this.endPhase(), ms)
  }

  private endPhase() {
    this.timer = undefined
    const before = this.lifeStatuses()
    this.send(this.game.endPhase())
    // Deaths and banishments show on the shared screen.
    if (this.lifeStatuses() !== before) this.ctx.broadcastState(this.room)
    this.startPhase()
  }

  private lifeStatuses() {
    return this.game.players.map((p) => p.lifeStatus).join()
  }
}
