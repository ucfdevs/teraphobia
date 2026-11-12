import { findSeat, getRoom, MAX_PLAYERS, newSeatId } from '../rooms/store.js'
import type { Room } from '../rooms/store.js'
import { emitEvent, onEvent, rejectUnknownEvents, sendError } from './events.js'
import type { GameServer, GameSocket } from './server.js'

export const MIN_PLAYERS = 4
const MAX_NAME_LENGTH = 16

// The public room snapshot. Never includes roles, tokens, or user ids.
export function roomState(room: Room) {
  return {
    code: room.code,
    status: room.status,
    preset: room.preset,
    hostConnected: room.hostSocketId !== undefined,
    seats: room.seats.map((seat) => ({
      seatId: seat.seatId,
      displayName: seat.displayName,
      connected: seat.connected,
      lifeStatus: 'alive',
      costume: null,
    })),
  }
}

export function broadcastRoomState(io: GameServer, room: Room) {
  emitEvent(io.to(room.code), 'room:state', roomState(room))
}

// The room this socket hosts, or null after telling the socket why not.
function hostedRoom(socket: GameSocket, event: string) {
  const room = socket.data.isHost && socket.data.code ? getRoom(socket.data.code) : undefined
  if (!room || room.hostSocketId !== socket.id) {
    sendError(socket, 'not_host', 'Only the host screen can do that', event)
    return null
  }
  return room
}

function connectHost(io: GameServer, socket: GameSocket) {
  const room = getRoom(socket.data.code!)
  if (!room) {
    socket.disconnect(true)
    return
  }
  // A newer host screen replaces an older one.
  const previous = room.hostSocketId && io.sockets.sockets.get(room.hostSocketId)
  room.hostSocketId = socket.id
  if (previous) previous.disconnect(true)
  socket.join(room.code)
  broadcastRoomState(io, room)
}

function join(io: GameServer, socket: GameSocket, { code, displayName }: { code: string; displayName: string }) {
  if (socket.data.isHost || socket.data.seatId) {
    sendError(socket, 'not_allowed', 'This connection already belongs to a room', 'room:join')
    return
  }
  const room = getRoom(code)
  if (!room) return sendError(socket, 'room_not_found', 'Room not found', 'room:join')
  if (room.status !== 'lobby') return sendError(socket, 'game_started', 'Game already started', 'room:join')
  if (room.seats.length >= MAX_PLAYERS) return sendError(socket, 'room_full', 'This room is full', 'room:join')

  const name = displayName.trim()
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return sendError(socket, 'invalid_payload', 'Display name must be 1 to 16 characters', 'room:join')
  }
  if (room.seats.some((seat) => seat.displayName.toLowerCase() === name.toLowerCase())) {
    return sendError(socket, 'name_taken', 'That name is taken in this room', 'room:join')
  }

  const seat = { seatId: newSeatId(), displayName: name, userId: socket.data.userId, socketId: socket.id, connected: true }
  room.seats.push(seat)
  socket.data.code = room.code
  socket.data.seatId = seat.seatId
  socket.join(room.code)
  broadcastRoomState(io, room)
}

function kick(io: GameServer, socket: GameSocket, { seatId }: { seatId: string }) {
  const room = hostedRoom(socket, 'room:kick')
  if (!room) return
  if (room.status !== 'lobby') return sendError(socket, 'wrong_phase', 'Players can only be kicked before Start', 'room:kick')
  const seat = findSeat(room, seatId)
  if (!seat) return sendError(socket, 'invalid_target', 'No such player', 'room:kick')

  room.seats = room.seats.filter((s) => s !== seat)
  const kicked = seat.socketId && io.sockets.sockets.get(seat.socketId)
  if (kicked) {
    kicked.data.seatId = undefined
    kicked.leave(room.code)
    kicked.disconnect(true)
  }
  broadcastRoomState(io, room)
}

function start(io: GameServer, socket: GameSocket) {
  const room = hostedRoom(socket, 'room:start')
  if (!room) return
  if (room.status !== 'lobby') return sendError(socket, 'wrong_phase', 'The game has already started', 'room:start')
  if (room.seats.length < MIN_PLAYERS) {
    return sendError(socket, 'not_enough_players', `At least ${MIN_PLAYERS} players are needed`, 'room:start')
  }
  // From here the code is closed to new phones.
  room.status = 'playing'
  room.startedAt = new Date()
  broadcastRoomState(io, room)
}

function disconnect(io: GameServer, socket: GameSocket) {
  const room = socket.data.code ? getRoom(socket.data.code) : undefined
  if (!room) return
  if (socket.data.isHost) {
    if (room.hostSocketId !== socket.id) return
    room.hostSocketId = undefined
  } else {
    const seat = socket.data.seatId ? findSeat(room, socket.data.seatId) : undefined
    if (!seat || seat.socketId !== socket.id) return
    if (room.status === 'lobby') {
      // A lobby seat is just freed; the phone can join again.
      room.seats = room.seats.filter((s) => s !== seat)
    } else {
      seat.connected = false
      seat.socketId = undefined
    }
  }
  broadcastRoomState(io, room)
}

export function registerLobby(io: GameServer, socket: GameSocket) {
  rejectUnknownEvents(socket)
  onEvent(socket, 'room:join', (payload: { code: string; displayName: string }) => join(io, socket, payload))
  onEvent(socket, 'room:kick', (payload: { seatId: string }) => kick(io, socket, payload))
  onEvent(socket, 'room:start', () => start(io, socket))
  socket.on('disconnect', () => disconnect(io, socket))
  if (socket.data.isHost) connectHost(io, socket)
}
