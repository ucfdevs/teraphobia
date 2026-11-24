// npm run balance -- [--games 2000] [--seed 1]
import { formatReport, runBalance } from '../src/game/balance.js'

function option(name: string, fallback: number) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`)
  return value
}

console.log(formatReport(runBalance(option('games', 2000), option('seed', 1))))
