// Bot players: fake phones that join a room and play random legal moves, so the web host screen can be tested
// end to end before the iOS app is ready. Also handy as a smoke test of a deployed server.
//
//   npm run bots -- --code ABCD                 5 bots join room ABCD; start the game from the host screen
//   npm run bots -- --code ABCD --count 7       7 bots
//   npm run bots -- --host --preset quick       also sign in, create the room, act as the host screen, and start
//   npm run bots -- --code ABCD --flaky 2       2 bots drop once mid-game and rejoin with their token
//   npm run bots -- --url https://teraphobia.com --code ABCD
//
// --host signs in with BOT_EMAIL and BOT_PASSWORD (a verified account), read from the environment so they
// never land in shell history. The script exits when the game ends.

import { parseArgs } from 'node:util'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4000' },
    code: { type: 'string' },
    count: { type: 'string', default: '5' },
    host: { type: 'boolean', default: false },
    preset: { type: 'string', default: 'quick' },
    flaky: { type: 'string', default: '0' },
    'flaky-ms': { type: 'string', default: '20000' },
    'timeout-min': { type: 'string', default: '30' },
    quiet: { type: 'boolean', default: false },
  },
})

const URL = args.url!.replace(/\/$/, '')
const COUNT = Number(args.count)
const FLAKY = Number(args.flaky)
const FLAKY_MS = Number(args['flaky-ms'])
const NAMES = ['Pumpkin', 'Ghosty', 'Bat', 'Cobweb', 'Candle', 'Raven', 'Skully', 'Mothman']

type Phase = 'night' | 'morning' | 'day' | 'discussion' | 'vote'

interface PublicSeat {
  seatId: string
  displayName: string
  connected: boolean
  lifeStatus: 'alive' | 'dead' | 'banished'
}

interface RoomState {
  code: string
  status: 'lobby' | 'playing' | 'ended'
  seats: PublicSeat[]
}

interface PhaseStart {
  phase: Phase
  round: number
  endsAt: number
  serverNow: number
}

interface ServerError {
  code: string
  message: string
  event?: string
}

interface GameOver {
  winner: string
  endReason: string
  rounds: number
  monster: { seatId: string; monsterType: string }
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function log(who: string, message: string) {
  if (!args.quiet) console.log(`${new Date().toISOString().slice(11, 19)} ${who.padEnd(8)} ${message}`)
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function chance(p: number) {
  return Math.random() < p
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function connect(auth?: Record<string, unknown>) {
  return io(URL, { transports: ['websocket'], auth, reconnection: true, reconnectionDelay: 1000 })
}

class Bot {
  readonly socket: Socket
  seatId?: string
  rejoinToken?: string
  role?: 'villager' | 'monster'
  monsterType?: 'vampire' | 'witch' | 'werewolf'
  seats: PublicSeat[] = []
  powerUsed = false
  lastCandle?: string
  dropped = false
  private actTimer?: NodeJS.Timeout

  constructor(
    readonly name: string,
    readonly code: string,
    readonly flaky: boolean,
  ) {
    this.socket = connect()
    // Every connect, including a rejoin after a drop, sends room:join. The token puts it back in its seat.
    this.socket.on('connect', () => {
      this.socket.emit('room:join', { code, displayName: name, ...(this.rejoinToken && { rejoinToken: this.rejoinToken }) })
    })
    this.socket.on('connect_error', (err) => log(name, `connect_error: ${err.message}`))
    this.socket.on('you:joined', ({ seatId, rejoinToken }: { seatId: string; rejoinToken: string }) => {
      this.seatId = seatId
      this.rejoinToken = rejoinToken
    })
    this.socket.on('you:rejoined', () => log(name, 'rejoined my seat'))
    this.socket.on('you:role', ({ role, monsterType }: { role: Bot['role']; monsterType?: Bot['monsterType'] }) => {
      this.role = role
      this.monsterType = monsterType
      log(name, role === 'monster' ? `I am the Monster (${monsterType})` : 'I am a Villager')
    })
    this.socket.on('room:state', (state: RoomState) => {
      this.seats = state.seats
    })
    this.socket.on('phase:start', (phase: PhaseStart) => this.onPhase(phase))
    this.socket.on('you:result', (result: { action: string; trait?: { slot: string; option: string } | null; candleBlocked?: boolean }) => {
      const found = result.trait ? `${result.trait.slot}=${result.trait.option}` : 'nothing'
      log(name, result.action === 'candle' ? `candle result: blocked=${result.candleBlocked}` : `${result.action} found ${found}`)
    })
    this.socket.on('error', (err: ServerError) => this.onError(err))
    this.socket.on('game:over', () => clearTimeout(this.actTimer))
  }

  private get alive() {
    return this.seats.find((s) => s.seatId === this.seatId)?.lifeStatus === 'alive'
  }

  private others() {
    return this.seats.filter((s) => s.lifeStatus === 'alive' && s.seatId !== this.seatId).map((s) => s.seatId)
  }

  private onError(err: ServerError) {
    if (err.event === 'room:join' && err.code === 'name_taken') {
      fail(`${this.name}: name taken in ${this.code}. Another bot run may already be in this room.`)
    }
    if (err.event === 'room:join') fail(`${this.name}: could not join ${this.code}: ${err.code} (${err.message})`)
    // A submit that arrives just after its phase ended can happen; anything else is worth seeing.
    log(this.name, `error ${err.code} on ${err.event ?? '?'}: ${err.message}`)
  }

  // Waits a short, human-looking moment, but always acts well before the phase ends.
  private onPhase({ phase, round, endsAt, serverNow }: PhaseStart) {
    clearTimeout(this.actTimer)
    if (this.flaky && !this.dropped && round >= 2 && phase === 'day') return this.drop()
    if (!this.alive || !this.role) return
    const window = Math.max(0, endsAt - serverNow)
    const delay = Math.min(1000 + Math.random() * 3000, window * 0.6)
    this.actTimer = setTimeout(() => this.act(phase, round), delay)
  }

  private act(phase: Phase, round: number) {
    const others = this.others()
    if (others.length === 0) return

    if (phase === 'night') {
      if (this.role === 'monster') {
        // The Werewolf's power: two victims, once, never on Night 1.
        const doubleKill = this.monsterType === 'werewolf' && !this.powerUsed && round > 1 && others.length > 2 && chance(0.4)
        const victims = doubleKill ? shuffle(others).slice(0, 2) : [pick(others)]
        if (doubleKill) this.powerUsed = true
        this.socket.emit('night:submit', { victimIds: victims })
        log(this.name, `night: kill ${victims.map((id) => this.nameOf(id)).join(' and ')}`)
      } else {
        const suspectId = pick(others)
        this.socket.emit('night:submit', { suspectId })
        log(this.name, `night: suspect ${this.nameOf(suspectId)}`)
      }
    }

    if (phase === 'day') {
      if (this.role === 'monster') {
        // Vampire and Witch powers, once, during Day.
        if (this.monsterType !== 'werewolf' && !this.powerUsed && chance(0.5)) {
          const targetId = pick(others)
          this.powerUsed = true
          this.socket.emit('power:use', { targetId })
          log(this.name, `day: ${this.monsterType} power on ${this.nameOf(targetId)}`)
        }
        return
      }
      // A candle can't protect the same player two nights in a row.
      const candleTargets = others.filter((id) => id !== this.lastCandle)
      const action = pick(candleTargets.length > 0 ? (['search', 'commune', 'candle'] as const) : (['search', 'commune'] as const))
      if (action === 'candle') {
        const targetId = pick(candleTargets)
        this.lastCandle = targetId
        this.socket.emit('day:submit', { action, targetId })
        log(this.name, `day: candle for ${this.nameOf(targetId)}`)
      } else {
        this.socket.emit('day:submit', { action })
        log(this.name, `day: ${action}`)
      }
    }

    if (phase === 'vote') {
      const targetId = chance(0.2) ? null : pick(others)
      this.socket.emit('vote:submit', { targetId })
      log(this.name, `vote: ${targetId ? this.nameOf(targetId) : 'Skip'}`)
    }
  }

  // Drops once mid-game and comes back with the rejoin token, to exercise rejoin and the Reconnecting screen.
  private drop() {
    this.dropped = true
    log(this.name, `dropping for ${FLAKY_MS / 1000}s`)
    this.socket.disconnect()
    setTimeout(() => this.socket.connect(), FLAKY_MS)
  }

  nameOf(seatId: string) {
    return this.seats.find((s) => s.seatId === seatId)?.displayName ?? seatId
  }
}

// --host: sign in, create a room, and connect as the host screen, which starts the game once every bot is in.
async function hostRoom() {
  const email = process.env.BOT_EMAIL
  const password = process.env.BOT_PASSWORD
  if (!email || !password) fail('--host needs BOT_EMAIL and BOT_PASSWORD (a verified account) in the environment')

  const login = await fetch(`${URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!login.ok) fail(`Sign in failed: ${login.status} ${await login.text()}`)
  const { accessToken } = (await login.json()) as { accessToken: string }

  const created = await fetch(`${URL}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ preset: args.preset }),
  })
  if (!created.ok) fail(`Creating the room failed: ${created.status} ${await created.text()}`)
  const { code } = (await created.json()) as { code: string }

  const host = connect({ token: accessToken })
  let started = false
  host.on('connect_error', (err) => fail(`Host screen could not connect: ${err.message}`))
  host.on('error', (err: ServerError) => log('HOST', `error ${err.code} on ${err.event ?? '?'}: ${err.message}`))
  host.on('room:state', (state: RoomState) => {
    if (!started && state.status === 'lobby' && state.seats.length === COUNT) {
      started = true
      log('HOST', `all ${COUNT} bots are in, starting`)
      host.emit('room:start', {})
    }
  })
  return { code, host }
}

// What the shared screen shows: phases, deaths, votes. Names come from the first bot's copy of room:state.
function watch(socket: Socket, bots: Bot[]) {
  const nameOf = (id: string | null) => (id ? bots[0].nameOf(id) : 'Skip')
  socket.on('phase:start', ({ phase, round, endsAt, serverNow }: PhaseStart) => {
    log('SCREEN', `round ${round} ${phase} (${Math.round((endsAt - serverNow) / 1000)}s)`)
  })
  socket.on('morning:reveal', ({ deadIds }: { deadIds: string[] }) => {
    log('SCREEN', deadIds.length ? `died in the night: ${deadIds.map(nameOf).join(', ')}` : 'everyone survived the night')
  })
  socket.on('vote:reveal', ({ votes, banishedId }: { votes: { voterId: string; targetId: string | null }[]; banishedId: string | null }) => {
    const tally = votes.map((v) => `${nameOf(v.voterId)}→${nameOf(v.targetId)}`).join(', ')
    log('SCREEN', `votes: ${tally}. ${banishedId ? `${nameOf(banishedId)} is banished` : 'nobody is banished'}`)
  })
}

async function main() {
  if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 8) fail('--count must be 1 to 8')
  if (!Number.isInteger(FLAKY) || FLAKY < 0 || FLAKY > COUNT) fail('--flaky must be 0 to --count')
  if (!args.host && !args.code) fail('Pass --code ABCD to join a room, or --host to create one')
  // Without --host, the last bot watches the room for the log, so it must stay connected.
  if (!args.host && FLAKY === COUNT) fail('Without --host, at least one bot must not be flaky')

  let code = args.code?.toUpperCase()
  let host: Socket | undefined
  if (args.host) ({ code, host } = await hostRoom())
  if (!code || !/^[A-Z]{4}$/.test(code)) fail(`Room code must be 4 letters, got ${code}`)

  console.log(`${COUNT} bots joining ${code} on ${URL}${FLAKY ? ` (${FLAKY} will drop once and rejoin)` : ''}`)
  const bots = NAMES.slice(0, COUNT).map((name, i) => new Bot(name, code, i < FLAKY))
  // The host socket sees every room event; without --host, a bot that never drops does.
  const screen = host ?? bots[bots.length - 1].socket
  watch(screen, bots)
  if (!args.host) console.log('Waiting for the host screen to start the game...')

  const timeoutMin = Number(args['timeout-min'])
  const timeout = setTimeout(() => fail(`No game over after ${timeoutMin} minutes`), timeoutMin * 60_000)
  const result = await new Promise<GameOver>((resolve) => screen.on('game:over', resolve))
  clearTimeout(timeout)

  const monster = bots.find((b) => b.seatId === result.monster.seatId)?.name ?? result.monster.seatId
  console.log(`\nGame over after ${result.rounds} round(s): ${result.winner} win (${result.endReason}). The Monster was ${monster}, a ${result.monster.monsterType}.`)
  for (const bot of bots) bot.socket.close()
  host?.close()
}

main().catch((err) => fail(String(err)))
