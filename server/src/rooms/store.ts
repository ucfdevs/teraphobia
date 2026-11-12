import { randomBytes, randomInt } from 'node:crypto'
import type { Preset } from '../models/game.js'

// Live rooms live in memory only (PRD). The socket handlers will import this module.

export const MAX_PLAYERS = 8
const CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CODE_LENGTH = 4

export interface Seat {
  seatId: string
  displayName: string
  // Set when the player's socket was signed in.
  userId?: string
  // The socket currently holding this seat, if connected.
  socketId?: string
  connected: boolean
}

export interface Room {
  code: string
  preset: Preset
  hostUserId: string
  createdAt: Date
  status: 'lobby' | 'playing' | 'ended'
  startedAt?: Date
  seats: Seat[]
  // The host screen's socket, while it is connected.
  hostSocketId?: string
}

export type RoomStatus = 'open' | 'started' | 'full'

const rooms = new Map<string, Room>()

function randomCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)]
  return code
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

export function createRoom(hostUserId: string, preset: Preset): Room {
  // One live room per host: a new room replaces the old one, so rooms can't pile up.
  for (const room of rooms.values()) {
    if (room.hostUserId === hostUserId) rooms.delete(room.code)
  }
  // 26^4 = 456,976 codes, so collisions are rare; the cap only guards against a full store.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = randomCode()
    if (rooms.has(code)) continue
    const room: Room = { code, preset, hostUserId, createdAt: new Date(), status: 'lobby', seats: [] }
    rooms.set(code, room)
    return room
  }
  throw new Error('No free room codes')
}

export function getRoom(code: string) {
  return rooms.get(normalizeCode(code))
}

export function roomStatus(room: Room): RoomStatus {
  if (room.status !== 'lobby') return 'started'
  if (room.seats.length >= MAX_PLAYERS) return 'full'
  return 'open'
}

export function newSeatId() {
  return `s_${randomBytes(6).toString('base64url')}`
}

export function findSeat(room: Room, seatId: string) {
  return room.seats.find((seat) => seat.seatId === seatId)
}

// Frees the code (game end or host leaves).
export function deleteRoom(code: string) {
  return rooms.delete(normalizeCode(code))
}

export function clearRooms() {
  rooms.clear()
}
