import { finishGame } from '../games/results.js'
import { phaseDurationMs } from '../game/phases.js'
import type { Outbound } from '../game/engine.js'
import { deleteRoom } from '../rooms/store.js'
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
// A player away for this many full rounds is removed as if killed.
export const ROUNDS_AWAY_LIMIT = 2

export class GameRunner {
  endsAt = 0
  private timer: unknown
  // Set while paused (host screen away): how long the current phase had left.
  private remainingMs: number | undefined

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

  get paused() {
    return this.remainingMs !== undefined
  }

  // The current phase:start payload (also used for rejoins). While paused, the time left is frozen.
  phaseStart() {
    const now = this.ctx.clock.now()
    const endsAt = this.paused ? now + this.remainingMs! : this.endsAt
    return { phase: this.game.phase, round: this.game.round, endsAt, serverNow: now }
  }

  pause() {
    if (this.paused || this.game.over) return
    this.remainingMs = Math.max(0, this.endsAt - this.ctx.clock.now())
    this.stop()
  }

  // Restarts the current phase's timer with the time it had left, and tells everyone the new end time.
  resume() {
    if (!this.paused || this.game.over) return
    const remaining = this.remainingMs!
    this.remainingMs = undefined
    this.endsAt = this.ctx.clock.now() + remaining
    this.schedule(remaining)
    this.send([{ to: 'room', event: 'phase:start', payload: this.phaseStart() }])
  }

  send(events: Outbound[]) {
    for (const { to, event, payload } of events) {
      if (to === 'room') this.ctx.toRoom(this.room, event as ServerEvent, payload)
      else this.ctx.toSeat(this.room, to.seatId, event as ServerEvent, payload)
    }
  }

  private startPhase() {
    if (this.game.phase === 'night') this.removeAbsentPlayers()
    if (this.game.over) return
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
    try {
      this.run(() => this.game.endPhase())
      if (!this.game.over) this.startPhase()
    } catch (err) {
      // This runs from a timer, so a throw would crash the server and every other live game with it.
      console.error(`Game in room ${this.room.code} could not end its phase`, err)
    }
  }

  // Runs an engine change and sends its events, then shows deaths on the shared screen and wraps up a
  // finished game.
  run(change: () => Outbound[]) {
    const before = this.lifeStatuses()
    const events = change()
    const gameOver = events.filter((e) => e.event === 'game:over')
    this.send(events.filter((e) => e.event !== 'game:over'))
    if (this.lifeStatuses() !== before) this.ctx.broadcastState(this.room)
    if (this.game.over && gameOver.length > 0) this.finish()
  }

  // Game over: tell the room, save the result in the background, and free the code.
  private finish() {
    this.stop()
    const { room, game } = this
    const endedAt = new Date(this.ctx.clock.now())
    void finishGame(
      {
        roomCode: room.code,
        hostUserId: room.hostUserId,
        preset: room.preset,
        startedAt: room.startedAt ?? endedAt,
        endedAt,
        seats: game.players.map((player) => {
          const seat = room.seats.find((s) => s.seatId === player.seatId)!
          return {
            seatId: player.seatId,
            displayName: seat.displayName,
            costume: { ...player.costume },
            userId: seat.userId,
            diedRound: player.diedRound,
          }
        }),
        result: game.over!,
      },
      (payload) => this.send([{ to: 'room', event: 'game:over', payload }]),
    )
    // room:state now shows `ended`.
    this.ctx.broadcastState(room)
    deleteRoom(room.code)
  }

  // At each round start: anyone who has been away for ROUNDS_AWAY_LIMIT full rounds is out.
  // Dropping during round k makes k+1 the first full round missed.
  private removeAbsentPlayers() {
    const round = this.game.round
    const gone = this.room.seats.filter(
      (seat) => !seat.connected && seat.awayRound !== undefined && round - (seat.awayRound + 1) >= ROUNDS_AWAY_LIMIT && this.game.alive(seat.seatId),
    )
    if (gone.length > 0) this.run(() => this.game.removePlayers(gone.map((seat) => seat.seatId)))
  }

  private lifeStatuses() {
    return this.game.players.map((p) => p.lifeStatus).join()
  }
}
