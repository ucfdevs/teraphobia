import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/engine.js'
import { NORMAL_DURATIONS_MS, PHASES, phaseDurationMs } from '../src/game/phases.js'
import { seededRandom } from '../src/game/random.js'
import { signAccessToken } from '../src/lib/session.js'
import { clearRooms, createRoom } from '../src/rooms/store.js'
import { ManualClock, startGame, startSocketServer } from './socketHelpers.js'
import type { SocketHarness } from './socketHelpers.js'

const HOST_ID = '64b000000000000000000001'

describe('phase durations', () => {
  it('uses the Normal timers', () => {
    expect(PHASES.map((p) => phaseDurationMs(p, 'normal'))).toEqual([30_000, 10_000, 30_000, 60_000, 30_000])
  })

  it('scales Quick by 0.67 and Relaxed by 1.5', () => {
    expect(PHASES.map((p) => phaseDurationMs(p, 'quick'))).toEqual([20_100, 6_700, 20_100, 40_200, 20_100])
    expect(PHASES.map((p) => phaseDurationMs(p, 'relaxed'))).toEqual([45_000, 15_000, 45_000, 90_000, 45_000])
  })
})

describe('GameEngine phases', () => {
  it('runs Night, Morning, Day, Discussion, Vote and then the next round', () => {
    const game = new GameEngine(['a', 'b', 'c', 'd'], seededRandom(1))
    const seen: string[] = [`${game.round}:${game.phase}`]
    for (let i = 0; i < 10; i += 1) {
      game.endPhase()
      seen.push(`${game.round}:${game.phase}`)
    }
    expect(seen).toEqual([
      '1:night', '1:morning', '1:day', '1:discussion', '1:vote',
      '2:night', '2:morning', '2:day', '2:discussion', '2:vote',
      '3:night',
    ])
  })
})

describe('server clock', () => {
  let harness: SocketHarness
  let clock: ManualClock

  beforeEach(async () => {
    clearRooms()
    clock = new ManualClock()
    harness = await startSocketServer({ clock, random: seededRandom(7) })
  })

  afterEach(async () => {
    clearRooms()
    await harness.close()
  })

  function hostRoom(preset: 'quick' | 'normal' | 'relaxed' = 'normal') {
    return () => ({ code: createRoom(HOST_ID, preset).code, hostToken: signAccessToken(HOST_ID) })
  }

  it('runs two full rounds in order on the Normal timers', async () => {
    const { host } = await startGame(harness, hostRoom(), 4)
    const first = host.all('phase:start')[0]
    expect(first).toEqual({ phase: 'night', round: 1, endsAt: clock.time + 30_000, serverNow: clock.time })

    const expected = [
      ['morning', 1], ['day', 1], ['discussion', 1], ['vote', 1],
      ['night', 2], ['morning', 2], ['day', 2], ['discussion', 2], ['vote', 2], ['night', 3],
    ] as const
    let current = first
    for (const [phase, round] of expected) {
      const duration = current.endsAt - clock.time
      expect(duration).toBe(NORMAL_DURATIONS_MS[current.phase as keyof typeof NORMAL_DURATIONS_MS])

      // One millisecond early, nothing happens.
      clock.advance(duration - 1)
      await host.flush()
      expect(host.all('phase:start')).toContain(current)
      expect(host.all('phase:start').at(-1)).toBe(current)

      clock.advance(1)
      current = await host.next('phase:start', (p) => p.phase === phase && p.round === round)
      expect(current.serverNow).toBe(clock.time)
    }
  })

  it('gives every client the same endsAt', async () => {
    const { host, phones } = await startGame(harness, hostRoom(), 5)
    clock.advance(30_000)
    const starts = await Promise.all([host, ...phones].map((c) => c.next('phase:start', (p) => p.phase === 'morning')))
    expect(new Set(starts.map((s) => s.endsAt)).size).toBe(1)
    expect(starts[0].endsAt).toBe(clock.time + 10_000)
  })

  it.each([['quick', 20_100], ['relaxed', 45_000]] as const)('uses the %s timers', async (preset, nightMs) => {
    const { host } = await startGame(harness, hostRoom(preset), 4)
    const night = host.all('phase:start')[0]
    expect(night.endsAt - night.serverNow).toBe(nightMs)
  })
})
