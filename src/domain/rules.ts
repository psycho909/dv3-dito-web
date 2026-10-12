import type { Tier } from './index'

export const REFILL_THRESHOLD = 15

export const ROUND_TOKEN_COST = 10
export const ROUND_MULTIPLIERS = [1, 2, 3, 5, 10, 20, 30] as const
export type RoundMultiplier = typeof ROUND_MULTIPLIERS[number]

export const TIER_SCORES = {
  PERFECT: 100,
  GREAT: 50,
  GOOD: 20,
  NORMAL: 5,
  BURST: 1,
} as const satisfies Readonly<Record<Tier, number>>
