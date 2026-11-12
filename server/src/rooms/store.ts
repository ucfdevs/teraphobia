import { randomInt, randomUUID } from 'node:crypto'
import type { Preset } from '../models/game.js'

// Live rooms live in memory only (PRD). The socket handlers in src/sockets use this module.

export const MAX_PLAYERS = 8
export const MIN_PLAYERS = 4
const CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CODE_LENGTH = 4

export interface Seat {
  seatId: string
  displayName: string
  connected: boolean
  userId?: string
}

export interface Room {
  code: string
  preset: Preset
  hostUserId: string
  hostConnected: boolean
  createdAt: Date
  startedAt?: Date
  seats: Seat[]
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
    const room: Room = { code, preset, hostUserId, hostConnected: false, createdAt: new Date(), seats: [] }
    rooms.set(code, room)
    return room
  }
  throw new Error('No free room codes')
}

export function getRoom(code: string) {
  return rooms.get(normalizeCode(code))
}

export function findRoomByHost(hostUserId: string) {
  for (const room of rooms.values()) {
    if (room.hostUserId === hostUserId) return room
  }
  return undefined
}

// Names are unique within a room, ignoring case and surrounding spaces.
export function nameTaken(room: Room, displayName: string) {
  const wanted = displayName.trim().toLowerCase()
  return room.seats.some((seat) => seat.displayName.toLowerCase() === wanted)
}

export function addSeat(room: Room, displayName: string): Seat {
  const seat: Seat = { seatId: randomUUID(), displayName: displayName.trim(), connected: true }
  room.seats.push(seat)
  return seat
}

export function removeSeat(room: Room, seatId: string) {
  const index = room.seats.findIndex((seat) => seat.seatId === seatId)
  return index === -1 ? undefined : room.seats.splice(index, 1)[0]
}

export function roomStatus(room: Room): RoomStatus {
  if (room.startedAt) return 'started'
  if (room.seats.length >= MAX_PLAYERS) return 'full'
  return 'open'
}

// Frees the code (game end or host leaves).
export function deleteRoom(code: string) {
  return rooms.delete(normalizeCode(code))
}

export function clearRooms() {
  rooms.clear()
}
