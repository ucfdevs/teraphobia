import type { Socket } from 'socket.io'
import type { NightSubmit, Rejection } from '../game/engine.js'
import { getRoom } from '../rooms/store.js'
import type { Room } from '../rooms/store.js'
import { onEvent, sendError } from './events.js'
import type { ClientEvent } from './schemas.js'

// In-game client events. Each goes to the engine for the sender's seat; a refusal comes back as `error`.

// The room and seat this socket plays in, from what rooms.ts recorded when it took the seat.
function seated(socket: Socket) {
  const { role, code, seatId } = socket.data as { role?: string; code?: string; seatId?: string }
  const room = role === 'player' && code ? getRoom(code) : undefined
  if (!room || !seatId || !room.seats.some((seat) => seat.seatId === seatId)) return null
  return { room, seatId }
}

function handle<T>(socket: Socket, event: ClientEvent, act: (payload: T, seatId: string, room: Room) => Rejection | null) {
  onEvent(socket, event, (payload: T) => {
    const here = seated(socket)
    if (!here) return sendError(socket, 'not_allowed', 'Join a room first', event)
    if (!here.room.game) return sendError(socket, 'wrong_phase', 'The game is not running', event)
    const rejection = act(payload, here.seatId, here.room)
    if (rejection) sendError(socket, rejection.code, rejection.message, event)
  })
}

export function registerPlay(socket: Socket) {
  handle<NightSubmit>(socket, 'night:submit', (payload, seatId, room) => room.game!.submitNight(seatId, payload))
}
