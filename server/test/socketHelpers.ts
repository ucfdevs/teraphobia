import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as connectClient } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { createApp } from '../src/app.js'
import { createSocketServer } from '../src/sockets/rooms.js'
import type { SocketServerOptions } from '../src/sockets/rooms.js'

const WAIT_MS = 2000

export interface Received {
  event: string
  payload: any
}

// A socket.io client that records every event, so tests can wait for one that already arrived.
export class TestClient {
  readonly log: Received[] = []
  private consumed = new Set<number>()
  private waiters: { match: (r: Received) => boolean; resolve: (r: Received) => void }[] = []

  constructor(readonly socket: Socket) {
    socket.onAny((event: string, payload: unknown) => this.record({ event, payload }))
    socket.on('disconnect', () => this.record({ event: 'disconnect', payload: null }))
  }

  private record(received: Received) {
    const index = this.log.push(received) - 1
    const waiter = this.waiters.find((w) => w.match(received))
    if (waiter) {
      this.consumed.add(index)
      this.waiters = this.waiters.filter((w) => w !== waiter)
      waiter.resolve(received)
    }
  }

  // The next event with this name (and matching the predicate) that no earlier call has taken.
  next(event: string, predicate: (payload: any) => boolean = () => true): Promise<any> {
    const match = (r: Received) => r.event === event && predicate(r.payload)
    const index = this.log.findIndex((r, i) => !this.consumed.has(i) && match(r))
    if (index >= 0) {
      this.consumed.add(index)
      return Promise.resolve(this.log[index].payload)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== done)
        reject(new Error(`Timed out waiting for ${event}. Got: ${this.log.map((r) => r.event).join(', ')}`))
      }, WAIT_MS)
      const done = (r: Received) => {
        clearTimeout(timer)
        resolve(r.payload)
      }
      this.waiters.push({ match, resolve: done })
    })
  }

  all(event: string) {
    return this.log.filter((r) => r.event === event).map((r) => r.payload)
  }

  // Drops everything received so far.
  clear() {
    this.consumed = new Set(this.log.map((_, i) => i))
  }

  emit(event: string, payload?: unknown) {
    if (payload === undefined) this.socket.emit(event)
    else this.socket.emit(event, payload)
  }

  // Sends an event and waits until the server has handled it (by round-tripping a ping behind it).
  async send(event: string, payload?: unknown) {
    this.emit(event, payload)
    await this.flush()
  }

  // Socket.io keeps order per connection, so an unknown event's error reply proves earlier events were handled.
  async flush() {
    const marker = `flush:${Math.random()}`
    this.socket.emit(marker)
    await this.next('error', (p) => p.event === marker)
  }

  close() {
    this.socket.disconnect()
  }
}

export async function startSocketServer(options: SocketServerOptions = {}) {
  const httpServer = createServer(createApp())
  const io = createSocketServer(httpServer, options)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
  const clients: TestClient[] = []

  async function connect(auth: Record<string, unknown> = {}) {
    const socket = connectClient(url, { path: '/socket.io', transports: ['websocket'], auth, forceNew: true, reconnection: false })
    const client = new TestClient(socket)
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', (err: Error & { data?: unknown }) => reject(err))
    })
    return client
  }

  async function close() {
    for (const client of clients) client.close()
    await new Promise<void>((resolve) => io.close(() => resolve()))
  }

  return { io, url, connect, close }
}

export type SocketHarness = Awaited<ReturnType<typeof startSocketServer>>

// A clock tests move by hand. Timers fire in time order, including ones scheduled while advancing.
export class ManualClock {
  time = 1_800_000_000_000
  private nextId = 1
  private timers: { id: number; at: number; fn: () => void }[] = []

  now = () => this.time

  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++
    this.timers.push({ id, at: this.time + ms, fn })
    return id
  }

  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== id)
  }

  advance(ms: number) {
    const target = this.time + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.timers = this.timers.filter((t) => t !== due)
      this.time = due.at
      due.fn()
    }
    this.time = target
  }

  pending() {
    return this.timers.length
  }
}

export interface StartedGame {
  host: TestClient
  phones: TestClient[]
  // you:role per phone, same order as phones.
  roles: { seatId: string; role: 'villager' | 'monster'; monsterType?: string; costume: Record<string, string> }[]
  code: string
  monster: TestClient
  villagers: TestClient[]
  seatOf: (phone: TestClient) => string
}

// Creates a room, seats `players` phones, starts the game, and waits for night 1.
export async function startGame(
  harness: SocketHarness,
  createHostRoom: () => { code: string; hostToken: string },
  players: number,
): Promise<StartedGame> {
  const { code, hostToken } = createHostRoom()
  const host = await harness.connect({ token: hostToken })
  await host.next('room:state')
  const phones: TestClient[] = []
  for (let i = 1; i <= players; i += 1) {
    const phone = await harness.connect()
    phone.emit('room:join', { code, displayName: `Player ${i}` })
    await host.next('room:state', (s) => s.seats.length === i)
    phones.push(phone)
  }
  host.emit('room:start', {})
  const roles = await Promise.all(phones.map((p) => p.next('you:role')))
  await Promise.all([host, ...phones].map((c) => c.next('phase:start', (p) => p.phase === 'night' && p.round === 1)))
  const monster = phones[roles.findIndex((r) => r.role === 'monster')]
  return {
    host,
    phones,
    roles,
    code,
    monster,
    villagers: phones.filter((p) => p !== monster),
    seatOf: (phone) => roles[phones.indexOf(phone)].seatId,
  }
}
