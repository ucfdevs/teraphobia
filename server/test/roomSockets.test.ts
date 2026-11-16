import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Types } from 'mongoose'
import { io as connect } from 'socket.io-client'
import type { Socket as ClientSocket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { createSocketServer } from '../src/sockets/rooms.js'

const httpServer = createServer()
const io = createSocketServer(httpServer)
let url = ''
const clients: ClientSocket[] = []

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
})

afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect()
  clearRooms()
})

afterAll(async () => {
  await io.close()
})

function client(auth?: Record<string, unknown>) {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth })
  clients.push(socket)
  return socket
}

// Resolves with the next payload of `event` that matches.
function waitFor(socket: ClientSocket, event: string, matches: (payload: any) => boolean = () => true) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2000)
    const listener = (payload: any) => {
      if (!matches(payload)) return
      clearTimeout(timer)
      socket.off(event, listener)
      resolve(payload)
    }
    socket.on(event, listener)
  })
}

function seatCount(n: number) {
  return (state: any) => state.seats.length === n
}

// A room with its host screen connected.
async function hostedRoom() {
  const hostUserId = new Types.ObjectId().toString()
  const room = createRoom(hostUserId, 'normal')
  const host = client({ token: signAccessToken(hostUserId) })
  const state = await waitFor(host, 'room:state')
  return { code: room.code, host, state }
}

// Sends room:join and resolves with whichever comes back first: the room state or an error.
function sendJoin(phone: ClientSocket, code: string, displayName: string) {
  const reply = Promise.race([
    waitFor(phone, 'room:state').then((state) => ({ state })),
    waitFor(phone, 'error').then((error) => ({ error })),
  ])
  phone.emit('room:join', { code, displayName })
  return reply as Promise<{ state?: any; error?: any }>
}

async function join(code: string, displayName: string) {
  const phone = client()
  const { state, error } = await sendJoin(phone, code, displayName)
  if (error) throw new Error(`Join failed: ${error.code}`)
  return { phone, state }
}

async function joinError(code: string, displayName: string) {
  const { error } = await sendJoin(client(), code, displayName)
  return error
}

async function fillRoom(code: string, count: number) {
  const phones = []
  for (let i = 0; i < count; i += 1) phones.push((await join(code, `Player ${i}`)).phone)
  return phones
}

function emitAndWaitError(socket: ClientSocket, event: string, payload: unknown) {
  const error = waitFor(socket, 'error')
  socket.emit(event, payload)
  return error
}

describe('host screen', () => {
  it('joins its own room as the screen, not a seat', async () => {
    const { code, state } = await hostedRoom()
    expect(state).toEqual({ code, status: 'lobby', preset: 'normal', hostConnected: true, seats: [] })
  })

  it('is refused with a bad token', async () => {
    const socket = client({ token: 'not-a-token' })
    const err = await waitFor(socket, 'connect_error')
    expect(err.message).toBe('Invalid or expired token')
  })

  it('gets room_not_found and is disconnected when the host has no room', async () => {
    const socket = client({ token: signAccessToken(new Types.ObjectId().toString()) })
    const disconnected = waitFor(socket, 'disconnect')
    expect(await waitFor(socket, 'error')).toMatchObject({ code: 'room_not_found' })
    await disconnected
  })

  it('shows hostConnected false to phones when the host screen leaves', async () => {
    const { code, host } = await hostedRoom()
    const { phone } = await join(code, 'Tera')

    const state = waitFor(phone, 'room:state', (s) => !s.hostConnected)
    host.disconnect()
    expect((await state).hostConnected).toBe(false)
    expect(getRoom(code)!.hostConnected).toBe(false)
  })
})

describe('room:join', () => {
  it('seats the phone and the host screen sees it live', async () => {
    const { code, host } = await hostedRoom()
    const hostSees = waitFor(host, 'room:state', seatCount(1))

    const { state } = await join(code, '  Tera ')

    expect(state.seats).toEqual([
      { seatId: expect.any(String), displayName: 'Tera', connected: true, lifeStatus: 'alive', costume: null },
    ])
    expect(await hostSees).toEqual(state)
  })

  it('answers room_not_found for an unknown code', async () => {
    expect(await joinError('ZZZZ', 'Tera')).toEqual({ code: 'room_not_found', message: 'No room with that code', event: 'room:join' })
  })

  it('answers game_started once the game has started', async () => {
    const { code, host } = await hostedRoom()
    await fillRoom(code, 4)
    const started = waitFor(host, 'room:state', (s) => s.status === 'playing')
    host.emit('room:start', {})
    await started

    expect(await joinError(code, 'Late')).toMatchObject({ code: 'game_started' })
  })

  it('answers room_full with 8 players', async () => {
    const { code } = await hostedRoom()
    await fillRoom(code, 8)
    expect(await joinError(code, 'Ninth')).toMatchObject({ code: 'room_full' })
  })

  it('answers name_taken for a name already in the room, ignoring case and spaces', async () => {
    const { code } = await hostedRoom()
    await join(code, 'Tera')
    expect(await joinError(code, ' tERA ')).toMatchObject({ code: 'name_taken' })
  })

  it('answers invalid_payload for a name that is blank or over 16 characters', async () => {
    const { code } = await hostedRoom()
    expect(await joinError(code, '   ')).toMatchObject({ code: 'invalid_payload', event: 'room:join' })
    expect(await joinError(code, 'x'.repeat(17))).toMatchObject({ code: 'invalid_payload', event: 'room:join' })
    expect(await joinError(code, '')).toMatchObject({ code: 'invalid_payload', event: 'room:join' })
  })

  it('answers not_allowed when a phone that already has a seat joins again', async () => {
    const { code } = await hostedRoom()
    const { phone } = await join(code, 'Tera')
    expect(await emitAndWaitError(phone, 'room:join', { code, displayName: 'Again' })).toMatchObject({ code: 'not_allowed' })
  })

  it('frees the seat when a phone leaves the lobby', async () => {
    const { code, host } = await hostedRoom()
    const { phone } = await join(code, 'Tera')
    const empty = waitFor(host, 'room:state', seatCount(0))
    phone.disconnect()
    await empty
    expect(getRoom(code)!.seats).toEqual([])
  })
})

describe('room:kick', () => {
  it('disconnects the kicked player and removes them from room:state', async () => {
    const { code, host } = await hostedRoom()
    const { phone: tera } = await join(code, 'Tera')
    const { state } = await join(code, 'Bernardo')
    const teraSeat = state.seats.find((s: any) => s.displayName === 'Tera').seatId

    const kicked = waitFor(tera, 'disconnect')
    const after = waitFor(host, 'room:state', seatCount(1))
    host.emit('room:kick', { seatId: teraSeat })

    expect(await kicked).toBe('io server disconnect')
    expect((await after).seats.map((s: any) => s.displayName)).toEqual(['Bernardo'])
  })

  it('answers invalid_target for a seat that is not in the room', async () => {
    const { host } = await hostedRoom()
    expect(await emitAndWaitError(host, 'room:kick', { seatId: 'nobody' })).toMatchObject({ code: 'invalid_target' })
  })

  it('answers game_started after Start', async () => {
    const { code, host } = await hostedRoom()
    await fillRoom(code, 4)
    const started = waitFor(host, 'room:state', (s) => s.status === 'playing')
    host.emit('room:start', {})
    const { seats } = await started

    expect(await emitAndWaitError(host, 'room:kick', { seatId: seats[0].seatId })).toMatchObject({ code: 'game_started' })
  })
})

describe('room:start', () => {
  it('fails with 3 players', async () => {
    const { code, host } = await hostedRoom()
    await fillRoom(code, 3)
    expect(await emitAndWaitError(host, 'room:start', {})).toMatchObject({ code: 'not_enough_players' })
    expect(getRoom(code)!.startedAt).toBeUndefined()
  })

  it('works with 4 and tells everyone the game is playing', async () => {
    const { code, host } = await hostedRoom()
    const phones = await fillRoom(code, 4)
    const phoneSees = waitFor(phones[0], 'room:state', (s) => s.status === 'playing')
    const hostSees = waitFor(host, 'room:state', (s) => s.status === 'playing')

    host.emit('room:start', {})

    expect((await hostSees).seats).toHaveLength(4)
    await phoneSees
  })

  it('keeps the seat but marks it disconnected when a phone leaves after Start', async () => {
    const { code, host } = await hostedRoom()
    const phones = await fillRoom(code, 4)
    const started = waitFor(host, 'room:state', (s) => s.status === 'playing')
    host.emit('room:start', {})
    await started

    const after = waitFor(host, 'room:state', (s) => s.seats.some((seat: any) => !seat.connected))
    phones[0].disconnect()
    const { seats } = await after
    expect(seats).toHaveLength(4)
    expect(seats.find((s: any) => s.displayName === 'Player 0').connected).toBe(false)
  })
})

describe('host-only events', () => {
  it('a phone cannot kick or start', async () => {
    const { code } = await hostedRoom()
    const phones = await fillRoom(code, 4)
    const seatId = getRoom(code)!.seats[1].seatId

    expect(await emitAndWaitError(phones[0], 'room:kick', { seatId })).toMatchObject({ code: 'not_host', event: 'room:kick' })
    expect(await emitAndWaitError(phones[0], 'room:start', {})).toMatchObject({ code: 'not_host', event: 'room:start' })
    expect(getRoom(code)!.seats).toHaveLength(4)
    expect(getRoom(code)!.startedAt).toBeUndefined()
  })

  it('a socket that never joined cannot kick or start', async () => {
    const stranger = client()
    expect(await emitAndWaitError(stranger, 'room:start', {})).toMatchObject({ code: 'not_host' })
  })
})

describe('validation', () => {
  it('answers invalid_payload for a malformed payload or an unknown event', async () => {
    const socket = client()
    expect(await emitAndWaitError(socket, 'room:join', { code: 'abcd', displayName: 'Tera' })).toMatchObject({ code: 'invalid_payload' })
    expect(await emitAndWaitError(socket, 'room:kick', 'seat')).toMatchObject({ code: 'invalid_payload' })
    expect(await emitAndWaitError(socket, 'admin:reset', {})).toMatchObject({ code: 'invalid_payload', message: 'Unknown event admin:reset' })
  })
})
