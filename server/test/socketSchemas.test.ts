import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitEvent, onEvent, rejectUnknownEvents } from '../src/sockets/events.js'
import type { EventSocket } from '../src/sockets/events.js'
import { CLIENT_EVENTS, eventNameForFile, SERVER_EVENTS, validateClientEvent, validateServerEvent } from '../src/sockets/schemas.js'

const SCHEMAS_DIR = join(import.meta.dirname, '..', '..', 'shared', 'schemas')

// Stands in for a socket.io Socket: records emits and lets a test deliver client events.
function fakeSocket() {
  const listeners = new Map<string, (...args: any[]) => unknown>()
  const anyListeners: ((event: string, ...args: any[]) => unknown)[] = []
  const emitted: { event: string; payload: unknown }[] = []
  const socket: EventSocket = {
    on: (event, listener) => listeners.set(event, listener),
    onAny: (listener) => anyListeners.push(listener),
    emit: (event, payload) => emitted.push({ event, payload }),
  }
  async function receive(event: string, ...args: unknown[]) {
    for (const listener of anyListeners) listener(event, ...args)
    await listeners.get(event)?.(...args)
  }
  return { socket, emitted, receive }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('socket schemas', () => {
  it('has exactly one event for every schema file, named as its description says', () => {
    for (const [dir, events] of [['client', CLIENT_EVENTS], ['server', SERVER_EVENTS]] as const) {
      const files = readdirSync(join(SCHEMAS_DIR, dir)).filter((f) => f.endsWith('.schema.json'))
      expect(files.map(eventNameForFile).sort()).toEqual([...events].sort())
      for (const file of files) {
        const { description } = JSON.parse(readFileSync(join(SCHEMAS_DIR, dir, file), 'utf8'))
        expect(description).toContain(`event \`${eventNameForFile(file)}\``)
      }
    }
  })

  const valid: [string, unknown][] = [
    ['room:join', { code: 'ABCD', displayName: 'Tera' }],
    ['room:join', { code: 'ABCD', displayName: 'Tera', rejoinToken: 'signed' }],
    ['room:kick', { seatId: 's1' }],
    ['room:start', {}],
    ['day:submit', { action: 'search' }],
    ['day:submit', { action: 'candle', targetId: 's2' }],
    ['night:submit', { victimIds: ['s1'] }],
    ['night:submit', { victimIds: ['s1', 's2'] }],
    ['night:submit', { suspectId: 's3' }],
    ['power:use', { targetId: 's1' }],
    ['vote:submit', { targetId: 's1' }],
    ['vote:submit', { targetId: null }],
  ]
  it.each(valid)('accepts a valid %s payload %j', (event, payload) => {
    expect(validateClientEvent(event, payload)).toEqual({ ok: true })
  })

  const invalid: [string, unknown][] = [
    ['room:join', undefined],
    ['room:join', 'ABCD'],
    ['room:join', { code: 'abcd', displayName: 'Tera' }],
    ['room:join', { code: 'ABCD', displayName: '' }],
    ['room:join', { code: 'ABCD', displayName: '   ' }],
    ['room:join', { code: 'ABCD', displayName: 'x'.repeat(17) }],
    ['room:join', { code: 'ABCD', displayName: 'Tera', isHost: true }],
    ['room:kick', { seatId: '' }],
    ['room:start', undefined],
    ['room:start', { preset: 'quick' }],
    ['day:submit', { action: 'candle' }],
    ['day:submit', { action: 'search', targetId: 's2' }],
    ['day:submit', { action: 'dance' }],
    ['night:submit', { victimIds: [] }],
    ['night:submit', { victimIds: ['s1', 's2', 's3'] }],
    ['night:submit', { victimIds: ['s1', 's1'] }],
    ['night:submit', { victimIds: ['s1'], suspectId: 's2' }],
    ['power:use', {}],
    ['vote:submit', {}],
    ['vote:submit', { targetId: 7 }],
  ]
  it.each(invalid)('rejects an invalid %s payload %j', (event, payload) => {
    expect(validateClientEvent(event, payload).ok).toBe(false)
  })

  it('rejects events that have no schema, and server events sent by a client', () => {
    expect(validateClientEvent('room:delete', {})).toEqual({ ok: false, message: 'Unknown event' })
    expect(validateClientEvent('room:state', {})).toEqual({ ok: false, message: 'Unknown event' })
  })

  it('checks server events too', () => {
    expect(validateServerEvent('error', { code: 'room_full', message: 'This room is full' })).toEqual({ ok: true })
    expect(validateServerEvent('error', { code: 'oops', message: 'x' }).ok).toBe(false)
  })
})

describe('onEvent', () => {
  it('runs the handler with a valid payload', async () => {
    const { socket, emitted, receive } = fakeSocket()
    const handler = vi.fn()
    onEvent(socket, 'room:kick', handler)

    await receive('room:kick', { seatId: 's1' })

    expect(handler).toHaveBeenCalledWith({ seatId: 's1' })
    expect(emitted).toEqual([])
  })

  it('answers an invalid payload with invalid_payload and never runs the handler', async () => {
    const { socket, emitted, receive } = fakeSocket()
    const handler = vi.fn()
    onEvent(socket, 'room:join', handler)

    await receive('room:join', { code: 'abcd', displayName: 'Tera' })
    await receive('room:join')

    expect(handler).not.toHaveBeenCalled()
    expect(emitted).toHaveLength(2)
    for (const { event, payload } of emitted) {
      expect(event).toBe('error')
      expect(payload).toMatchObject({ code: 'invalid_payload', event: 'room:join', message: expect.stringContaining('payload') })
    }
  })

  it('ignores an acknowledgement callback after the payload', async () => {
    const { socket, receive } = fakeSocket()
    const handler = vi.fn()
    onEvent(socket, 'room:start', handler)

    await receive('room:start', {}, () => {})

    expect(handler).toHaveBeenCalledWith({})
  })

  it('answers internal when the handler throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { socket, emitted, receive } = fakeSocket()
    onEvent(socket, 'room:start', async () => {
      throw new Error('boom')
    })

    await receive('room:start', {})

    expect(emitted).toEqual([{ event: 'error', payload: { code: 'internal', message: 'Something went wrong', event: 'room:start' } }])
  })
})

describe('rejectUnknownEvents', () => {
  it('answers events with no schema and leaves known ones alone', async () => {
    const { socket, emitted, receive } = fakeSocket()
    rejectUnknownEvents(socket)
    onEvent(socket, 'room:start', () => {})

    await receive('room:start', {})
    await receive('admin:reset', {})

    expect(emitted).toEqual([{ event: 'error', payload: { code: 'invalid_payload', message: 'Unknown event admin:reset', event: 'admin:reset' } }])
  })
})

describe('emitEvent', () => {
  it('sends a valid server event', () => {
    const { socket, emitted } = fakeSocket()
    expect(emitEvent(socket, 'error', { code: 'room_full', message: 'This room is full' })).toBe(true)
    expect(emitted).toEqual([{ event: 'error', payload: { code: 'room_full', message: 'This room is full' } }])
  })

  it('throws on an invalid server event outside production', () => {
    const { socket, emitted } = fakeSocket()
    expect(() => emitEvent(socket, 'room:state', { code: 'ABCD' })).toThrow(/room:state does not match its schema/)
    expect(emitted).toEqual([])
  })

  it('logs and drops an invalid server event in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { socket, emitted } = fakeSocket()

    expect(emitEvent(socket, 'room:state', { code: 'ABCD' })).toBe(false)
    expect(emitted).toEqual([])
    expect(log).toHaveBeenCalledOnce()
  })
})
