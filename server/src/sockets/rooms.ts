// The lobby over socket.io (FR-5, FR-6): phones join by code and name, the host screen sees the live list,
// can kick before Start, and starts the game. Every payload goes through onEvent and emitEvent (schemas.ts).

import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { GameEngine } from '../game/engine.js'
import { secureRandom } from '../game/random.js'
import type { Rng } from '../game/random.js'
import { verifyAccessToken } from '../lib/session.js'
import { addSeat, findRoomByHost, getRoom, MAX_PLAYERS, MIN_PLAYERS, nameTaken, removeSeat } from '../rooms/store.js'
import type { Room, Seat } from '../rooms/store.js'
import { realClock } from './clock.js'
import type { Clock } from './clock.js'
import { emitEvent, onEvent, rejectUnknownEvents, sendError } from './events.js'
import { GameRunner } from './gameRunner.js'
import type { RunnerContext } from './gameRunner.js'
import { registerPlay } from './play.js'
import { signRejoinToken, verifyRejoinToken } from './rejoin.js'

// What the server remembers about each connection.
interface SocketData {
  // Set by the handshake when an access token is sent: by the host screen, or by a signed-in phone that
  // also sends `auth.player: true`.
  userId?: string
  signedInPlayer?: boolean
  role?: 'host' | 'player'
  code?: string
  seatId?: string
}

interface RoomJoin {
  code: string
  displayName: string
  rejoinToken?: string
}

interface RoomKick {
  seatId: string
}

function channel(code: string) {
  return `room:${code}`
}

export function roomState(room: Room) {
  return {
    code: room.code,
    status: room.game?.over ? 'ended' : room.startedAt ? 'playing' : 'lobby',
    preset: room.preset,
    hostConnected: room.hostConnected,
    seats: room.seats.map((seat) => {
      const player = room.game?.player(seat.seatId)
      return {
        seatId: seat.seatId,
        displayName: seat.displayName,
        connected: seat.connected,
        lifeStatus: player?.lifeStatus ?? 'alive',
        // Costumes are public once dealt at Start.
        costume: player ? { ...player.costume } : null,
      }
    }),
  }
}

// Everything this player already knows, for a phone that just got its seat back.
function youRejoined(room: Room, seatId: string) {
  const game = room.game
  const you = game?.youRole(seatId) ?? null
  return {
    room: roomState(room),
    phase: room.runner && !game?.over ? room.runner.phaseStart() : null,
    you,
    results: game?.results.get(seatId) ?? [],
    lastCandleTargetId: game?.lastCandleTarget.get(seatId) ?? null,
    ...(you?.role === 'monster' ? { powerUsed: game!.powerUsed } : {}),
  }
}

export interface SocketServerOptions {
  // Seeded in tests (and the balance script) so deals repeat.
  random?: Rng
  // A manual clock in tests.
  clock?: Clock
}

export function createSocketServer(httpServer: HttpServer, options: SocketServerOptions = {}) {
  const random = options.random ?? secureRandom
  const io = new Server(httpServer, { path: '/socket.io', serveClient: false })
  // The socket in each seat and the host screen of each room, so a kick can disconnect the right phone
  // and an old host tab closing doesn't mark a newer one as gone.
  const seatSockets = new Map<string, Socket>()
  const hostSockets = new Map<string, Socket>()

  function broadcast(room: Room) {
    emitEvent(io.to(channel(room.code)), 'room:state', roomState(room))
  }

  // How game runners reach the room and each seat's phone.
  const runnerContext: RunnerContext = {
    clock: options.clock ?? realClock,
    toRoom: (room, event, payload) => emitEvent(io.to(channel(room.code)), event, payload),
    toSeat: (_room, seatId, event, payload) => {
      const phone = seatSockets.get(seatId)
      if (phone) emitEvent(phone, event, payload)
    },
    broadcastState: (room) => broadcast(room),
  }

  // A bad token is refused before connecting, so the host screen sees connect_error instead of joining as a phone.
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token
    if (token === undefined) return next()
    const userId = typeof token === 'string' ? verifyAccessToken(token) : null
    if (!userId) return next(new Error('Invalid or expired token'))
    ;(socket.data as SocketData).userId = userId
    ;(socket.data as SocketData).signedInPlayer = socket.handshake.auth?.player === true
    next()
  })

  io.on('connection', (socket) => {
    const data = socket.data as SocketData
    rejectUnknownEvents(socket)
    registerPlay(socket)

    if (data.userId && !data.signedInPlayer) connectHost(socket, data)

    onEvent<RoomJoin>(socket, 'room:join', ({ code, displayName, rejoinToken }) => {
      if (data.role) return sendError(socket, 'not_allowed', 'Already in a room', 'room:join')
      const room = getRoom(code)
      if (!room) return sendError(socket, 'room_not_found', 'No room with that code', 'room:join')

      // Back to an existing seat, even after Start: guests by rejoin token, signed-in players by account.
      if (rejoinToken !== undefined) {
        const claim = verifyRejoinToken(rejoinToken)
        const seat = claim?.code === room.code ? room.seats.find((s) => s.seatId === claim.seatId) : undefined
        if (!seat) return sendError(socket, 'invalid_rejoin_token', 'That seat is no longer yours', 'room:join')
        return takeSeat(socket, data, room, seat, true)
      }
      const accountSeat = data.signedInPlayer ? room.seats.find((s) => s.userId === data.userId) : undefined
      if (accountSeat) return takeSeat(socket, data, room, accountSeat, true)

      if (room.startedAt) return sendError(socket, 'game_started', 'Game already started', 'room:join')
      if (room.seats.length >= MAX_PLAYERS) return sendError(socket, 'room_full', 'This room is full', 'room:join')
      if (nameTaken(room, displayName)) return sendError(socket, 'name_taken', 'That name is taken in this room', 'room:join')

      const seat = addSeat(room, displayName)
      // Signed-in players' results count toward their stats (#37).
      if (data.signedInPlayer) seat.userId = data.userId
      takeSeat(socket, data, room, seat, false)
    })

    onEvent<RoomKick>(socket, 'room:kick', ({ seatId }) => {
      const room = hostRoom(socket, data, 'room:kick')
      if (!room) return
      if (room.startedAt) return sendError(socket, 'game_started', 'Players can only be kicked before Start', 'room:kick')
      if (!removeSeat(room, seatId)) return sendError(socket, 'invalid_target', 'No player in that seat', 'room:kick')

      const kicked = seatSockets.get(seatId)
      seatSockets.delete(seatId)
      if (kicked) {
        // Cleared first (the same object its handlers hold), so its disconnect handler does nothing more.
        Object.assign(kicked.data as SocketData, { role: undefined, code: undefined, seatId: undefined })
        kicked.disconnect(true)
      }
      broadcast(room)
    })

    onEvent(socket, 'room:start', () => {
      const room = hostRoom(socket, data, 'room:start')
      if (!room) return
      if (room.startedAt) return sendError(socket, 'game_started', 'Game already started', 'room:start')
      if (room.seats.length < MIN_PLAYERS) {
        return sendError(socket, 'not_enough_players', `At least ${MIN_PLAYERS} players are needed to start`, 'room:start')
      }
      // Closes the code to new phones, deals costumes, and picks the Monster.
      room.startedAt = new Date()
      room.game = new GameEngine(room.seats.map((seat) => seat.seatId), random)
      broadcast(room)
      // Each phone learns only its own role; only the Monster's includes monsterType.
      for (const seat of room.seats) {
        const phone = seatSockets.get(seat.seatId)
        if (phone) emitEvent(phone, 'you:role', room.game.youRole(seat.seatId))
      }
      room.runner = new GameRunner(runnerContext, room)
      room.runner.start()
    })

    socket.on('disconnect', () => {
      const room = data.code ? getRoom(data.code) : undefined
      if (!room) return

      if (data.role === 'host') {
        if (hostSockets.get(room.code) !== socket) return
        hostSockets.delete(room.code)
        room.hostConnected = false
        // The game keeps running on the server, but its timers wait for the host screen.
        room.runner?.pause()
      } else if (data.role === 'player' && data.seatId) {
        seatSockets.delete(data.seatId)
        // Before Start a phone that leaves frees its seat. After Start the seat stays for rejoining (#29).
        if (!room.startedAt) removeSeat(room, data.seatId)
        else {
          const seat = room.seats.find((s) => s.seatId === data.seatId)
          if (seat) {
            seat.connected = false
            seat.awayRound = room.game?.round
          }
        }
      }
      broadcast(room)
    })
  })

  // The host screen joins its own room as the screen, not a seat.
  function connectHost(socket: Socket, data: SocketData) {
    const room = findRoomByHost(data.userId!)
    if (!room) {
      sendError(socket, 'room_not_found', 'Create a room first')
      socket.disconnect(true)
      return
    }
    // A newer host tab replaces an older one. The new one is recorded first, so the old one's disconnect is ignored.
    const previous = hostSockets.get(room.code)
    hostSockets.set(room.code, socket)
    previous?.disconnect(true)
    Object.assign(data, { role: 'host', code: room.code })
    room.hostConnected = true
    socket.join(channel(room.code))
    broadcast(room)
    // Timers paused while the host screen was away pick up where they stopped.
    room.runner?.resume()
  }

  // Puts this socket in the seat, taking it from an older connection if there is one, and gives the phone
  // its rejoin token. A rejoining phone also gets everything it already knew.
  function takeSeat(socket: Socket, data: SocketData, room: Room, seat: Seat, rejoining: boolean) {
    const previous = seatSockets.get(seat.seatId)
    seatSockets.set(seat.seatId, socket)
    if (previous && previous !== socket) {
      // Cleared first, so its disconnect handler leaves the seat alone.
      Object.assign(previous.data as SocketData, { role: undefined, code: undefined, seatId: undefined })
      previous.disconnect(true)
    }
    seat.connected = true
    seat.awayRound = undefined
    Object.assign(data, { role: 'player', code: room.code, seatId: seat.seatId })
    socket.join(channel(room.code))
    emitEvent(socket, 'you:joined', { seatId: seat.seatId, rejoinToken: signRejoinToken(room.code, seat.seatId) })
    if (rejoining) emitEvent(socket, 'you:rejoined', youRejoined(room, seat.seatId))
    broadcast(room)
  }

  function hostRoom(socket: Socket, data: SocketData, event: string) {
    const room = data.role === 'host' && data.code ? getRoom(data.code) : undefined
    if (!room || room.hostUserId !== data.userId) {
      sendError(socket, 'not_host', 'Only the host can do that', event)
      return undefined
    }
    return room
  }

  return io
}
