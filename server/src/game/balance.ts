// The balance simulation (#116): plays seeded bot games against the engine, with no sockets, and reports
// how often each side wins at each player count. `npm run balance` in server/ prints the report.

import { GameEngine } from './engine.js'
import type { DayOutcome, Outbound, Rejection, RuleOptions, SearchResult, Trait } from './engine.js'
import { pick, seededRandom } from './random.js'
import type { Rng } from './random.js'

export const PLAYER_COUNTS = [4, 5, 6, 7, 8] as const
// The PRD's target: each side wins 40% to 60% of games.
export const TARGET = { min: 0.4, max: 0.6 }
// Games that drag on past this are counted as Monster wins (it only needs time); none should get here.
const MAX_ROUNDS = 50

export interface CountResult {
  players: number
  games: number
  villagerWinRate: number
  monsterWinRate: number
  averageRounds: number
  inTarget: boolean
}

// What the Villager bots know, pooled as if every Villager shares their clues honestly in Discussion.
class VillageKnowledge {
  // Oldest first, so a contradiction (a Witch's fake) can be resolved by dropping the newest clue.
  private clues: { trait: Trait; monsterHas: boolean }[] = []
  lastSearcher: string | undefined

  constructor(private readonly game: GameEngine) {}

  learn(events: Outbound[]) {
    for (const { event, payload } of events) {
      if (event === 'you:result') {
        const { trait } = payload as SearchResult
        this.clues.push({ trait, monsterHas: true })
      }
      if (event === 'day:result') {
        const outcome = payload as DayOutcome
        if (outcome.action === 'commune' && outcome.trait) this.clues.push({ trait: outcome.trait, monsterHas: false })
        if (outcome.searcherId) this.lastSearcher = outcome.searcherId
      }
    }
  }

  // Living players who fit every clue. If the clues rule out everyone, the newest ones must be fakes.
  suspects(): string[] {
    for (let n = this.clues.length; n >= 0; n -= 1) {
      const clues = this.clues.slice(0, n)
      const fits = this.game.livingPlayers().filter((p) => clues.every((c) => (p.costume[c.trait.slot] === c.trait.option) === c.monsterHas))
      if (fits.length > 0) {
        this.clues = clues
        return fits.map((p) => p.seatId)
      }
    }
    return []
  }
}

// Bots only make legal moves, so a refusal is a bot bug.
function must(rejection: Rejection | null) {
  if (rejection) throw new Error(`Bot move refused: ${rejection.code} (${rejection.message})`)
}

function villagers(game: GameEngine) {
  return game.livingPlayers().filter((p) => p.role === 'villager').map((p) => p.seatId)
}

function playNight(game: GameEngine, knowledge: VillageKnowledge, rng: Rng) {
  const targets = villagers(game)
  // The Monster goes after whoever knows the most: the last searcher.
  const first = knowledge.lastSearcher && targets.includes(knowledge.lastSearcher) ? knowledge.lastSearcher : pick(rng, targets)
  const others = targets.filter((id) => id !== first)
  const wantsDouble = game.monsterType === 'werewolf' && !game.powerUsed && game.round > 1 && others.length > 0
  must(game.submitNight(game.monsterSeatId, { victimIds: wantsDouble ? [first, pick(rng, others)] : [first] }))
}

function playDay(game: GameEngine, knowledge: VillageKnowledge, rng: Rng) {
  const options = game.dayOptions()
  const suspects = knowledge.suspects()
  // Protect the player who knows the most, or anyone if that isn't allowed tonight.
  const protectable = game.livingPlayers().map((p) => p.seatId).filter((id) => id !== game.lastProtected)
  const guardTarget =
    knowledge.lastSearcher && protectable.includes(knowledge.lastSearcher) ? knowledge.lastSearcher : pick(rng, protectable)

  for (const id of villagers(game)) {
    // Gather clues while the field is wide; once it is narrow, guard the village.
    if (options.search) must(game.submitDay(id, { action: 'search' }))
    else if (suspects.length > 2 && options.commune) must(game.submitDay(id, { action: 'commune' }))
    else must(game.submitDay(id, { action: 'candle', targetId: guardTarget }))
  }

  // The Monster votes for the action that tells the village nothing, and spends its power on a Search day.
  const candleFor = pick(rng, protectable.filter((id) => id !== game.monsterSeatId))
  if (candleFor) must(game.submitDay(game.monsterSeatId, { action: 'candle', targetId: candleFor }))
  if (options.search && !game.powerUsed && game.monsterType !== 'werewolf') must(game.usePower(game.monsterSeatId))
}

function playVote(game: GameEngine, knowledge: VillageKnowledge) {
  const suspects = knowledge.suspects()
  // The village settles on one name in Discussion: the first suspect in seat order, when few are left.
  const consensus = (excluding: string) => suspects.filter((id) => id !== excluding)
  for (const id of villagers(game)) {
    const mine = consensus(id)
    must(game.submitVote(id, mine.length > 0 && mine.length <= 3 ? mine[0] : null))
  }
  // The Monster pushes the same vote when it lands on a Villager, and otherwise frames the next suspect.
  const framed = consensus(game.monsterSeatId)
  must(game.submitVote(game.monsterSeatId, suspects.length <= 3 && framed.length > 0 ? framed[0] : null))
}

// Plays one game to the end and returns the winner and how many rounds it took.
export function playGame(players: number, seed: number, rules: RuleOptions = {}) {
  const seats = Array.from({ length: players }, (_, i) => `seat${i + 1}`)
  const game = new GameEngine(seats, seededRandom(seed), rules)
  const botRng = seededRandom(seed ^ 0x5bd1e995)
  const knowledge = new VillageKnowledge(game)

  while (!game.over && game.round <= MAX_ROUNDS) {
    if (game.phase === 'night') playNight(game, knowledge, botRng)
    if (game.phase === 'day') playDay(game, knowledge, botRng)
    if (game.phase === 'vote') playVote(game, knowledge)
    knowledge.learn(game.endPhase())
  }
  return { winner: game.over?.winner ?? 'monster', rounds: game.over?.rounds ?? MAX_ROUNDS }
}

export function simulate(players: number, games: number, seed: number, rules: RuleOptions = {}): CountResult {
  let villagerWins = 0
  let rounds = 0
  for (let i = 0; i < games; i += 1) {
    // A distinct, repeatable seed per game.
    const result = playGame(players, (seed * 1_000_003 + players * 10_007 + i) >>> 0, rules)
    if (result.winner === 'villagers') villagerWins += 1
    rounds += result.rounds
  }
  const villagerWinRate = villagerWins / games
  return {
    players,
    games,
    villagerWinRate,
    monsterWinRate: 1 - villagerWinRate,
    averageRounds: rounds / games,
    inTarget: villagerWinRate >= TARGET.min && villagerWinRate <= TARGET.max,
  }
}

export interface BalanceReport {
  games: number
  seed: number
  withCooldown: CountResult[]
  withoutCooldown: CountResult[]
  keepCooldown: boolean
}

// Runs every player count with and without "no Search two days in a row", and recommends the version
// with more counts in the 40-60% band (ties go to whichever sits closer to 50% on average).
export function runBalance(games: number, seed: number): BalanceReport {
  const withCooldown = PLAYER_COUNTS.map((n) => simulate(n, games, seed, { searchCooldown: true }))
  const withoutCooldown = PLAYER_COUNTS.map((n) => simulate(n, games, seed, { searchCooldown: false }))
  const inBand = (rows: CountResult[]) => rows.filter((r) => r.inTarget).length
  const drift = (rows: CountResult[]) => rows.reduce((sum, r) => sum + Math.abs(r.villagerWinRate - 0.5), 0)
  const keepCooldown =
    inBand(withCooldown) !== inBand(withoutCooldown)
      ? inBand(withCooldown) > inBand(withoutCooldown)
      : drift(withCooldown) <= drift(withoutCooldown)
  return { games, seed, withCooldown, withoutCooldown, keepCooldown }
}

const percent = (x: number) => `${x.toFixed(1)}%`.padStart(7)

export function formatTable(rows: CountResult[]) {
  const lines = ['Players  Villagers  Monster  Avg rounds  Flag']
  for (const r of rows) {
    // Rounded once, so the two columns add up to 100%.
    const villagerPct = Math.round(r.villagerWinRate * 1000) / 10
    const flag = r.inTarget ? '' : r.villagerWinRate < TARGET.min ? 'Monster too strong' : 'Villagers too strong'
    lines.push(`${String(r.players).padEnd(9)}${percent(villagerPct).padEnd(11)}${percent(100 - villagerPct).padEnd(9)}${r.averageRounds.toFixed(2).padStart(10)}  ${flag}`)
  }
  return lines.join('\n')
}

export function formatReport(report: BalanceReport) {
  return [
    `Balance simulation: ${report.games} games per player count, seed ${report.seed}. Target: each side wins 40-60%.`,
    '',
    'With "no Search two days in a row" (current rule):',
    formatTable(report.withCooldown),
    '',
    'Without it:',
    formatTable(report.withoutCooldown),
    '',
    `Recommendation: ${report.keepCooldown ? 'keep' : 'drop'} "no Search two days in a row".`,
  ].join('\n')
}
