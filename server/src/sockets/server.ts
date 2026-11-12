import type { Server as HttpServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { getRoom } from '../rooms/store.js'
import { registerLobby } from './lobby.js'

// What the server knows about a connection. Set once in the handshake, and when the socket takes a seat.
export interface SocketData {
  // From a valid access token in `auth.token`, for signed-in players and the host screen.
  userId?: string
  // The room this socket belongs to, as host screen or seat.
  code?: string
  // Set for a host screen connection (`auth.hostCode`).
  isHost?: boolean
  seatId?: string
}

export type GameSocket = Socket<any, any, any, SocketData>
export type GameServer = Server<any, any, any, SocketData>

function connectError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code, message } })
}

// Handshake: `auth.token` is an optional access token; the host screen also sends `auth.hostCode` for its room.
function authenticate(socket: GameSocket, next: (err?: Error) => void) {
  const { token, hostCode } = (socket.handshake.auth ?? {}) as { token?: unknown; hostCode?: unknown }
  if (token !== undefined) {
    try {
      const payload = jwt.verify(String(token), process.env.JWT_SECRET!, { algorithms: ['HS256'] })
      if (typeof payload === 'string' || !payload.sub) throw new Error('No subject')
      socket.data.userId = payload.sub
    } catch {
      next(connectError('not_allowed', 'Invalid or expired token'))
      return
    }
  }
  if (hostCode !== undefined) {
    const room = typeof hostCode === 'string' ? getRoom(hostCode) : undefined
    if (!room) return next(connectError('room_not_found', 'Room not found'))
    if (!socket.data.userId || room.hostUserId !== socket.data.userId) {
      return next(connectError('not_host', 'Only the host can open the host screen'))
    }
    socket.data.code = room.code
    socket.data.isHost = true
  }
  next()
}

// Grows as the game engine lands (clock, random source).
export interface SocketServerOptions {}

// Attaches Socket.io at /socket.io. Nginx proxies it alongside /api.
export function attachSockets(httpServer: HttpServer, _options: SocketServerOptions = {}) {
  const io: GameServer = new Server(httpServer, { path: '/socket.io', serveClient: false })
  io.use(authenticate)
  io.on('connection', (socket) => registerLobby(io, socket))
  return io
}
