import type { Preset } from '../models/game.js'

export const PHASES = ['night', 'morning', 'day', 'discussion', 'vote'] as const
export type Phase = (typeof PHASES)[number]

// Normal preset, in milliseconds (PRD: about 2.5 minutes per round).
export const NORMAL_DURATIONS_MS: Record<Phase, number> = {
  night: 30_000,
  morning: 10_000,
  day: 30_000,
  discussion: 60_000,
  vote: 30_000,
}

export const PRESET_SCALE: Record<Preset, number> = { quick: 0.67, normal: 1, relaxed: 1.5 }

export function phaseDurationMs(phase: Phase, preset: Preset) {
  return Math.round(NORMAL_DURATIONS_MS[phase] * PRESET_SCALE[preset])
}

export function nextPhase(phase: Phase): Phase {
  return PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length]
}
