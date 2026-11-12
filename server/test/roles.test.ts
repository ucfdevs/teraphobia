import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom } from '../src/rooms/store.js'
import { startSocketServer } from './socketHelpers.js'
import type { SocketHarness, TestClient } from './socketHelpers.js'

const HOST_ID = '64b000000000000000000001'

let harness: SocketHarness

beforeEach(async () => {
  clearRooms()
  harness = await startSocketServer({ random: seededRandom(4) })
})

afterEach(async () => {
  clearRooms()
  await harness.close()
})

describe('room:start deals the game', () => {
  it('shows public costumes and sends each phone only its own role', async () => {
    const { code } = createRoom(HOST_ID, 'normal')
    const host = await harness.connect({ token: signAccessToken(HOST_ID) })
    await host.next('room:state')
    const phones: TestClient[] = []
    for (let i = 1; i <= 5; i += 1) {
      const phone = await harness.connect()
      phone.emit('room:join', { code, displayName: `Player ${i}` })
      await host.next('room:state', (s) => s.seats.length === i)
      phones.push(phone)
    }

    host.emit('room:start', {})
    const state = await host.next('room:state', (s) => s.status === 'playing')
    for (const seat of state.seats) expect(seat.costume).toEqual({ hat: expect.any(String), mask: expect.any(String), item: expect.any(String) })

    const roles = await Promise.all(phones.map((phone) => phone.next('you:role')))
    const seatIds = state.seats.map((s: { seatId: string }) => s.seatId)
    expect(new Set(roles.map((r) => r.seatId))).toEqual(new Set(seatIds))
    expect(roles.filter((r) => r.role === 'monster')).toHaveLength(1)
    for (const role of roles) {
      if (role.role === 'villager') expect(role).not.toHaveProperty('monsterType')
      else expect(role.monsterType).toMatch(/^(vampire|witch)$/)
      expect(role.costume).toEqual(state.seats.find((s: { seatId: string }) => s.seatId === role.seatId).costume)
    }
    // Nobody gets a second role, and the host screen gets none.
    for (const phone of phones) expect(phone.all('you:role')).toHaveLength(1)
    expect(host.all('you:role')).toHaveLength(0)
  })
})
