import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { signRejoinToken } from '../src/sockets/rejoin.js'
import { createUser } from './helpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness, StartedGame, TestClient } from './socketHelpers.js'

const HOST_ID = '64b000000000000000000001'
const ROUND_MS = 30_000 + 10_000 + 30_000 + 60_000 + 30_000

let harness: SocketHarness
let clock: ManualClock

const hostRoom = () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) })

beforeEach(async () => {
  clearRooms()
  clock = new ManualClock()
  harness = await startSocketServer({ clock, random: seededRandom(31) })
})

afterEach(async () => {
  clearRooms()
  await harness.close()
})

async function tokenOf(phone: TestClient) {
  return (await phone.next('you:joined')).rejoinToken as string
}

async function dropAndWait(game: StartedGame, phone: TestClient) {
  const seatId = game.seatOf(phone)
  phone.close()
  await game.host.next('room:state', (s) => s.seats.some((seat: { seatId: string; connected: boolean }) => seat.seatId === seatId && !seat.connected))
}

function seatState(game: StartedGame, seatId: string) {
  return getRoom(game.code)?.game?.player(seatId)
}

describe('rejoin', () => {
  it('gives each phone its seat id and a rejoin token on join', async () => {
    const game = await startGame(harness, hostRoom, 4)
    for (const phone of game.phones) {
      expect(await phone.next('you:joined')).toEqual({ seatId: game.seatOf(phone), rejoinToken: expect.any(String) })
    }
  })

  it('puts a dropped player back in the same seat with their role and clues', async () => {
    const game = await startGame(harness, hostRoom, 5)
    const [searcher] = game.villagers
    const token = await tokenOf(searcher)
    clock.advance(40_000)
    await searcher.next('phase:start', (p) => p.phase === 'day')
    await searcher.send('day:submit', { action: 'search' })
    clock.advance(30_000)
    const result = await searcher.next('you:result')

    await dropAndWait(game, searcher)
    clock.advance(5_000)
    const back = await harness.connect()
    back.emit('room:join', { code: game.code, displayName: 'Anything', rejoinToken: token })

    const rejoined = await back.next('you:rejoined')
    expect(rejoined).toEqual({
      room: expect.objectContaining({ code: game.code, status: 'playing' }),
      phase: { phase: 'discussion', round: 1, endsAt: clock.time + 55_000, serverNow: clock.time },
      you: game.roles[game.phones.indexOf(searcher)],
      results: [result],
      lastCandleTargetId: null,
    })
    expect(await back.next('you:joined')).toMatchObject({ seatId: game.seatOf(searcher) })
    const state = await game.host.next('room:state', (s) => s.seats.every((seat: { connected: boolean }) => seat.connected))
    expect(state.seats).toHaveLength(5)

    // And can play on from the same seat.
    clock.advance(55_000)
    await back.next('phase:start', (p) => p.phase === 'vote')
    await back.send('vote:submit', { targetId: null })
    expect(back.all('error').filter((e: { event: string }) => e.event === 'vote:submit')).toEqual([])
  })

  it('tells a rejoining Monster whether its power is used', async () => {
    const game = await startGame(harness, hostRoom, 4)
    const token = await tokenOf(game.monster)
    await dropAndWait(game, game.monster)
    const back = await harness.connect()
    back.emit('room:join', { code: game.code, displayName: 'M', rejoinToken: token })
    expect(await back.next('you:rejoined')).toMatchObject({ you: { role: 'monster' }, powerUsed: false })
  })

  it('rejects a wrong token, and a token for another room or seat', async () => {
    const game = await startGame(harness, hostRoom, 4)
    const other = createRoom('64b000000000000000000009', 'normal')
    const tokens = ['garbage', signRejoinToken(other.code, game.seatOf(game.phones[0])), signRejoinToken(game.code, 's_unknown')]
    for (const rejoinToken of tokens) {
      const phone = await harness.connect()
      phone.emit('room:join', { code: game.code, displayName: 'Thief', rejoinToken })
      expect(await phone.next('error')).toMatchObject({ code: 'invalid_rejoin_token' })
    }
    // A new phone without a token can't join a started game.
    const late = await harness.connect()
    late.emit('room:join', { code: game.code, displayName: 'Late' })
    expect(await late.next('error')).toMatchObject({ code: 'game_started' })
  })

  it('lets a signed-in player rejoin through their account', async () => {
    const user = await createUser()
    const { code } = hostRoom()
    const host = await harness.connect({ token: signAccessToken(HOST_ID) })
    const phones: TestClient[] = []
    for (let i = 0; i < 4; i += 1) {
      const phone = await harness.connect(i === 0 ? { token: signAccessToken(user.id), player: true } : {})
      phone.emit('room:join', { code, displayName: `P${i}` })
      await host.next('room:state', (s) => s.seats.length === i + 1)
      phones.push(phone)
    }
    // The seat remembers the account, so the game counts toward that player's stats.
    expect(getRoom(code)!.seats[0].userId).toBe(user.id)
    expect(getRoom(code)!.seats[1].userId).toBeUndefined()
    host.emit('room:start', {})
    const role = await phones[0].next('you:role')
    phones[0].close()
    await host.next('room:state', (s) => s.seats.some((seat: { connected: boolean }) => !seat.connected))

    const back = await harness.connect({ token: signAccessToken(user.id), player: true })
    back.emit('room:join', { code, displayName: 'Ignored' })
    expect((await back.next('you:rejoined')).you).toEqual(role)
  })
})

describe('2-round removal', () => {
  it('removes a player gone for 2 full rounds as if killed', async () => {
    const game = await startGame(harness, hostRoom, 6)
    const [gone] = game.villagers
    // Drops during round 1, so rounds 2 and 3 are the full rounds missed.
    await dropAndWait(game, gone)

    clock.advance(ROUND_MS * 2)
    await game.host.next('phase:start', (p) => p.phase === 'night' && p.round === 3)
    expect(seatState(game, game.seatOf(gone))!.lifeStatus).toBe('alive')

    clock.advance(ROUND_MS)
    const state = await game.host.next('room:state', (s) =>
      s.seats.some((seat: { seatId: string; lifeStatus: string }) => seat.seatId === game.seatOf(gone) && seat.lifeStatus === 'dead'),
    )
    expect(state.status).toBe('playing')
    await game.host.next('phase:start', (p) => p.phase === 'night' && p.round === 4)
    expect(seatState(game, game.seatOf(gone))).toMatchObject({ lifeStatus: 'dead', diedRound: 4 })
  })

  it('a reconnect resets the count', async () => {
    const game = await startGame(harness, hostRoom, 6)
    const [gone] = game.villagers
    const token = await tokenOf(gone)
    await dropAndWait(game, gone)
    clock.advance(ROUND_MS * 2)
    const back = await harness.connect()
    back.emit('room:join', { code: game.code, displayName: 'x', rejoinToken: token })
    await back.next('you:rejoined')
    back.close()
    await game.host.next('room:state', (s) => s.seats.some((seat: { connected: boolean }) => !seat.connected))
    clock.advance(ROUND_MS)
    await game.host.next('phase:start', (p) => p.phase === 'night' && p.round === 4)
    expect(seatState(game, game.seatOf(gone))!.lifeStatus).toBe('alive')
  })

  it('a missing Monster forfeits', async () => {
    const game = await startGame(harness, hostRoom, 5)
    await dropAndWait(game, game.monster)
    clock.advance(ROUND_MS * 3)
    const over = await game.host.next('game:over')
    expect(over).toMatchObject({ winner: 'villagers', endReason: 'forfeit', rounds: 4, monster: { seatId: game.seatOf(game.monster) } })
    expect(getRoom(game.code)).toBeUndefined()
  })
})

describe('host pause', () => {
  it('pauses timers while the host screen is away and resumes with the time left', async () => {
    const game = await startGame(harness, hostRoom, 4)
    clock.advance(10_000)
    game.host.close()
    await game.phones[0].next('room:state', (s) => !s.hostConnected)

    // The server keeps running, but Night doesn't end.
    clock.advance(5 * 60_000)
    await game.phones[0].flush()
    expect(game.phones[0].all('phase:start')).toHaveLength(1)

    const host = await harness.connect({ token: signAccessToken(HOST_ID) })
    expect(await host.next('room:state')).toMatchObject({ hostConnected: true, status: 'playing' })
    const resumed = await game.phones[0].next('phase:start', (p) => p.serverNow === clock.time)
    expect(resumed).toEqual({ phase: 'night', round: 1, endsAt: clock.time + 20_000, serverNow: clock.time })
    expect(await host.next('phase:start')).toEqual(resumed)

    clock.advance(19_999)
    await game.phones[0].flush()
    expect(game.phones[0].all('morning:reveal')).toEqual([])
    clock.advance(1)
    await game.phones[0].next('morning:reveal')
  })
})
