import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom, getRoom } from '../src/rooms/store.js'
import { advanceTo, engineWith, eventsNamed, villagerIds } from './engineHelpers.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

describe('GameEngine night', () => {
  it('kills the Monster’s pick at Morning and keeps the last pick', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    expect(game.submitNight(game.monsterSeatId, { victimIds: [v1] })).toBeNull()
    expect(game.submitNight(game.monsterSeatId, { victimIds: [v2] })).toBeNull()

    const events = game.endPhase()
    expect(eventsNamed(events, 'morning:reveal')).toEqual([{ round: 1, deadIds: [v2] }])
    expect(game.player(v2)!.lifeStatus).toBe('dead')
    expect(game.player(v1)!.lifeStatus).toBe('alive')
    expect(game.phase).toBe('morning')
  })

  it('kills nobody when the Monster makes no pick', () => {
    const game = engineWith(4)
    expect(eventsNamed(game.endPhase(), 'morning:reveal')).toEqual([{ round: 1, deadIds: [] }])
    expect(game.livingPlayers()).toHaveLength(4)
  })

  it('keeps Villager hunches, last answer per night', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    game.submitNight(v1, { suspectId: v2 })
    game.submitNight(v1, { suspectId: game.monsterSeatId })
    game.submitNight(v2, { suspectId: v1 })
    game.endPhase()
    expect(game.hunches).toEqual([
      { seatId: v1, round: 1, suspectId: game.monsterSeatId },
      { seatId: v2, round: 1, suspectId: v1 },
    ])
  })

  it('rejects a dead player’s submit', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    game.submitNight(game.monsterSeatId, { victimIds: [v1] })
    advanceTo(game, 'night', 2)
    expect(game.submitNight(v1, { suspectId: v2 })).toMatchObject({ code: 'not_allowed' })
    expect(game.submitNight(game.monsterSeatId, { victimIds: [v1] })).toMatchObject({ code: 'invalid_target' })
  })

  it('rejects a Villager sending a victim, the Monster picking itself, and the wrong shapes', () => {
    const game = engineWith(5)
    const [v1, v2] = villagerIds(game)
    expect(game.submitNight(v1, { victimIds: [v2] })).toMatchObject({ code: 'not_allowed' })
    expect(game.submitNight(game.monsterSeatId, { victimIds: [game.monsterSeatId] })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitNight(game.monsterSeatId, { suspectId: v1 })).toMatchObject({ code: 'not_allowed' })
    expect(game.submitNight(v1, { suspectId: v1 })).toMatchObject({ code: 'invalid_target' })
    expect(game.submitNight(v1, { suspectId: 'nobody' })).toMatchObject({ code: 'invalid_target' })
    expect(game.endPhase()).toEqual([{ to: 'room', event: 'morning:reveal', payload: { round: 1, deadIds: [] } }])
  })

  it('accepts night picks only at Night', () => {
    const game = engineWith(5)
    const [v1] = villagerIds(game)
    game.endPhase()
    expect(game.submitNight(game.monsterSeatId, { victimIds: [v1] })).toMatchObject({ code: 'wrong_phase' })
  })
})

describe('night over sockets', () => {
  const HOST_ID = '64b000000000000000000001'
  let harness: SocketHarness
  let clock: ManualClock
  const hostRoom = () => ({ code: createRoom(HOST_ID, 'normal').code, hostToken: signAccessToken(HOST_ID) })

  beforeEach(async () => {
    clearRooms()
    clock = new ManualClock()
    harness = await startSocketServer({ clock, random: seededRandom(3) })
  })

  afterEach(async () => {
    clearRooms()
    await harness.close()
  })

  it('reveals the kill to everyone at Morning and doesn’t end Night early', async () => {
    const game = await startGame(harness, hostRoom, 5)
    const [victim, ...others] = game.villagers
    await game.monster.send('night:submit', { victimIds: [game.seatOf(victim)] })
    for (const v of game.villagers) await v.send('night:submit', { suspectId: game.seatOf(game.monster) })

    // Everyone has submitted, but Night still runs to its timer.
    clock.advance(29_999)
    await game.host.flush()
    expect(game.host.all('morning:reveal')).toEqual([])

    clock.advance(1)
    for (const client of [game.host, ...game.phones]) {
      expect(await client.next('morning:reveal')).toEqual({ round: 1, deadIds: [game.seatOf(victim)] })
    }
    const state = await game.host.next('room:state', (s) => s.seats.some((seat: { lifeStatus: string }) => seat.lifeStatus === 'dead'))
    expect(state.seats.find((s: { seatId: string }) => s.seatId === game.seatOf(victim)).lifeStatus).toBe('dead')
    expect(getRoom(game.code)!.game!.hunches).toHaveLength(4)

    // The dead player can't act next Night.
    clock.advance(10_000 + 30_000 + 60_000 + 30_000)
    await victim.next('phase:start', (p) => p.phase === 'night' && p.round === 2)
    victim.emit('night:submit', { suspectId: game.seatOf(others[0]) })
    expect(await victim.next('error')).toMatchObject({ code: 'not_allowed', event: 'night:submit' })
  })

  it('reveals no deaths when the Monster makes no pick', async () => {
    const game = await startGame(harness, hostRoom, 4)
    clock.advance(30_000)
    expect(await game.host.next('morning:reveal')).toEqual({ round: 1, deadIds: [] })
  })

  it('rejects a Villager’s victim and the Monster picking itself', async () => {
    const game = await startGame(harness, hostRoom, 4)
    const [v1, v2] = game.villagers
    v1.emit('night:submit', { victimIds: [game.seatOf(v2)] })
    expect(await v1.next('error')).toMatchObject({ code: 'not_allowed' })
    game.monster.emit('night:submit', { victimIds: [game.seatOf(game.monster)] })
    expect(await game.monster.next('error')).toMatchObject({ code: 'invalid_target' })
  })

  it('rejects in-game events from the host screen and from sockets with no seat', async () => {
    const game = await startGame(harness, hostRoom, 4)
    game.host.emit('night:submit', { suspectId: game.seatOf(game.monster) })
    expect(await game.host.next('error')).toMatchObject({ code: 'not_allowed' })
    const stranger = await harness.connect()
    stranger.emit('night:submit', { suspectId: game.seatOf(game.monster) })
    expect(await stranger.next('error')).toMatchObject({ code: 'not_allowed' })
  })
})
