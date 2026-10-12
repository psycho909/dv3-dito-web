import type { Tier } from './index'

export const BURST_DISTANCE = 22
export const REFILL_THRESHOLD = 15

export type ScoreForTier<T extends Tier> = T extends 'NORMAL'
  ? { status: 'UNCONFIRMED' }
  : { status: 'CONFIRMED'; points: number }

export type TierScores = { [T in Tier]: ScoreForTier<T> }

export const TIER_SCORES = {
  PERFECT: { status: 'CONFIRMED', points: 100 },
  GREAT: { status: 'CONFIRMED', points: 50 },
  GOOD: { status: 'CONFIRMED', points: 20 },
  NORMAL: { status: 'UNCONFIRMED' },
  BURST: { status: 'CONFIRMED', points: 1 },
} as const satisfies TierScores
