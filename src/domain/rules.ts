import type { Tier } from './index'

export const REFILL_THRESHOLD = 15

export const TIER_SCORES = {
  PERFECT: 100,
  GREAT: 50,
  GOOD: 20,
  NORMAL: 5,
  BURST: 1,
} as const satisfies Readonly<Record<Tier, number>>
