import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import type { Room } from '../src/rooms/store.js'
import { startSocketServer } from './socketHelpers.js'
import type { SocketHarness, TestClient } from './socketHelpers.js'

const HOST_ID = '64b000000000000000000001'

let harness: SocketHarness
let room: Room
let host: TestClient

beforeEach(async () => {
  clearRooms()
  harness = await startSocketServer()
  room = createRoom(HOST_ID, 'normal')
  host = await harness.connect({ token: signAccessToken(HOST_ID), hostCode: room.code })
  await host.next('room:state')
})

afterEach(async () => {
  await harness.close()
})

async function joinPlayer(displayName: string) {
  const client = await harness.connect()
  client.emit('room:join', { code: room.code, displayName })
  await host.next('room:state', (s) => s.seats.some((seat: { displayName: string }) => seat.displayName === displayName.trim()))
  return client
}

async function joinPlayers(n: number) {
  const clients: TestClient[] = []
  for (let i = 1; i <= n; i += 1) clients.push(await joinPlayer(`Player ${i}`))
  return clients
}

function lastState() {
  return host.all('room:state').at(-1)
}

describe('host screen', () => {
  it('joins its own room and sees an empty lobby', async () => {
    expect(host.all('room:state')[0]).toEqual({ code: room.code, status: 'lobby', preset: 'normal', hostConnected: true, seats: [] })
  })

  it('needs the host’s access token', async () => {
    await expect(harness.connect({ token: signAccessToken('64b000000000000000000002'), hostCode: room.code })).rejects.toMatchObject({
      data: { code: 'not_host' },
    })
    await expect(harness.connect({ hostCode: room.code })).rejects.toMatchObject({ data: { code: 'not_host' } })
    await expect(harness.connect({ token: 'garbage' })).rejects.toMatchObject({ data: { code: 'not_allowed' } })
  })

  it('shows hostConnected false while the host screen is away', async () => {
    const phone = await joinPlayer('Ana')
    host.close()
    const state = await phone.next('room:state', (s) => !s.hostConnected)
    expect(state.seats).toHaveLength(1)
  })
})

describe('room:join', () => {
  it('seats a player and everyone sees the live list', async () => {
    const ana = await joinPlayer('  Ana  ')
    const state = await ana.next('room:state')
    expect(state.seats).toEqual([{ seatId: expect.stringMatching(/^s_/), displayName: 'Ana', connected: true, lifeStatus: 'alive', costume: null }])
    expect(getRoom(room.code)!.seats).toHaveLength(1)
  })

  it('rejects a lowercase code by schema (clients uppercase it)', async () => {
    const client = await harness.connect()
    client.emit('room:join', { code: room.code.toLowerCase(), displayName: 'Ana' })
    expect(await client.next('error')).toMatchObject({ code: 'invalid_payload' })
  })

  it('room_not_found for an unknown code', async () => {
    const client = await harness.connect()
    client.emit('room:join', { code: room.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', displayName: 'Ana' })
    expect(await client.next('error')).toMatchObject({ code: 'room_not_found', event: 'room:join' })
  })

  it('game_started once the host has started', async () => {
    await joinPlayers(4)
    host.emit('room:start', {})
    await host.next('room:state', (s) => s.status === 'playing')
    const late = await harness.connect()
    late.emit('room:join', { code: room.code, displayName: 'Late' })
    expect(await late.next('error')).toMatchObject({ code: 'game_started' })
  })

  it('room_full at 8 players', async () => {
    await joinPlayers(8)
    const ninth = await harness.connect()
    ninth.emit('room:join', { code: room.code, displayName: 'Ninth' })
    expect(await ninth.next('error')).toMatchObject({ code: 'room_full' })
  })

  it('name_taken for a name already in the room, ignoring case', async () => {
    await joinPlayer('Ana')
    const twin = await harness.connect()
    twin.emit('room:join', { code: room.code, displayName: ' ANA ' })
    expect(await twin.next('error')).toMatchObject({ code: 'name_taken' })
  })

  it.each([[''], ['   '], ['x'.repeat(17)], ['  ' + 'x'.repeat(15)]])('rejects the name %j', async (displayName) => {
    const client = await harness.connect()
    client.emit('room:join', { code: room.code, displayName })
    expect(await client.next('error')).toMatchObject({ code: 'invalid_payload' })
  })

  it('trims the name', async () => {
    await joinPlayer(' ' + 'x'.repeat(14) + ' ')
    expect(lastState().seats[0].displayName).toBe('x'.repeat(14))
  })

  it('one connection holds one seat', async () => {
    const ana = await joinPlayer('Ana')
    ana.emit('room:join', { code: room.code, displayName: 'Ana Again' })
    expect(await ana.next('error')).toMatchObject({ code: 'not_allowed' })
  })

  it('frees a lobby seat when its phone disconnects', async () => {
    const ana = await joinPlayer('Ana')
    ana.close()
    await host.next('room:state', (s) => s.seats.length === 0)
  })
})

describe('room:kick', () => {
  it('disconnects the kicked player and removes them from room:state', async () => {
    const [ana, ben] = await joinPlayers(2)
    const anaSeat = lastState().seats.find((s: { displayName: string }) => s.displayName === 'Player 1').seatId

    host.emit('room:kick', { seatId: anaSeat })
    await ana.next('disconnect')
    const state = await ben.next('room:state', (s) => s.seats.length === 1)
    expect(state.seats.map((s: { displayName: string }) => s.displayName)).toEqual(['Player 2'])
  })

  it('rejects an unknown seat', async () => {
    host.emit('room:kick', { seatId: 's_nobody' })
    expect(await host.next('error')).toMatchObject({ code: 'invalid_target' })
  })

  it('is host only', async () => {
    const [ana, ben] = await joinPlayers(2)
    const benSeat = lastState().seats[1].seatId
    ana.emit('room:kick', { seatId: benSeat })
    expect(await ana.next('error')).toMatchObject({ code: 'not_host', event: 'room:kick' })
    expect(getRoom(room.code)!.seats).toHaveLength(2)
    expect(ben.socket.connected).toBe(true)
  })

  it('is lobby only', async () => {
    await joinPlayers(4)
    host.emit('room:start', {})
    await host.next('room:state', (s) => s.status === 'playing')
    host.emit('room:kick', { seatId: lastState().seats[0].seatId })
    expect(await host.next('error')).toMatchObject({ code: 'wrong_phase' })
  })
})

describe('room:start', () => {
  it('fails with 3 players and works with 4', async () => {
    await joinPlayers(3)
    host.emit('room:start', {})
    expect(await host.next('error')).toMatchObject({ code: 'not_enough_players', event: 'room:start' })
    expect(getRoom(room.code)!.status).toBe('lobby')

    await joinPlayer('Player 4')
    host.emit('room:start', {})
    const state = await host.next('room:state', (s) => s.status === 'playing')
    expect(state.seats).toHaveLength(4)
    expect(getRoom(room.code)!.startedAt).toBeInstanceOf(Date)
  })

  it('is host only', async () => {
    const [ana] = await joinPlayers(4)
    ana.emit('room:start', {})
    expect(await ana.next('error')).toMatchObject({ code: 'not_host', event: 'room:start' })
    expect(getRoom(room.code)!.status).toBe('lobby')
  })
})
