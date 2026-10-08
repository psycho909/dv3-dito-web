export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
export type Tier = 'PERFECT' | 'GREAT' | 'GOOD' | 'NORMAL' | 'BURST'
export type Deck = Readonly<Record<Rank, number>>

export const RANKS: readonly Rank[] = Object.freeze([
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10',
])

export const TIER_ORDER: readonly Tier[] = Object.freeze([
  'PERFECT', 'GREAT', 'GOOD', 'NORMAL', 'BURST',
])

export const INITIAL_DECK: Deck = Object.freeze({
  A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4,
  '7': 4, '8': 4, '9': 4, '10': 16,
})

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && RANKS.includes(value as Rank)
}

export function score(hand: readonly Rank[]): number {
  if (!Array.isArray(hand) || !hand.every(isRank)) {
    throw new TypeError('Hand must contain only valid ranks')
  }
  const aceCount = hand.filter((rank) => rank === 'A').length
  const base = hand.reduce((sum, rank) => sum + (rank === 'A' ? 1 : Number(rank)), 0)
  return aceCount > 0 && base + 10 <= 21 ? base + 10 : base
}

export function classify(total: number): Tier {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError('Score must be a nonnegative integer')
  }
  if (total >= 22) return 'BURST'
  if (total === 21) return 'PERFECT'
  if (total >= 19 && total <= 20) return 'GREAT'
  if (total >= 16) return 'GOOD'
  if (total <= 15) return 'NORMAL'
  return 'NORMAL'
}

export function deriveRemainingDeck(hand: readonly Rank[]): Deck {
  if (!Array.isArray(hand) || !hand.every(isRank)) {
    throw new TypeError('Hand must contain only valid ranks')
  }
  const remaining: Record<Rank, number> = { ...INITIAL_DECK }
  for (const rank of hand) {
    remaining[rank] -= 1
    if (remaining[rank] < 0) {
      throw new RangeError(`Hand exceeds initial inventory for rank ${rank}`)
    }
  }
  return remaining
}

type RankOutcome = {
  rank: Rank
  remainingCount: number
  probability: number
  nextScore: number
  tier: Tier
}

type TierOutcome = { tier: Tier; matchingCount: number; probability: number }

type ComputableDraw = {
  isComputable: true
  currentScore: number
  remainingTotal: number
  rankOutcomes: RankOutcome[]
  tierOutcomes: TierOutcome[]
  safeProbability: number
  burstProbability: number
}

type UncomputableDraw = {
  isComputable: false
  reason: 'INVALID_DECK' | 'EMPTY_DECK'
  currentScore: number
  remainingTotal: number
}

export function calculateNextDraw(
  hand: readonly Rank[],
  deck: unknown,
): ComputableDraw | UncomputableDraw {
  const currentScore = score(hand)
  if (!validateDeck(deck)) {
    return { isComputable: false, reason: 'INVALID_DECK', currentScore, remainingTotal: 0 }
  }

  const remainingTotal = RANKS.reduce((sum, rank) => sum + deck[rank], 0)
  if (remainingTotal === 0) {
    return { isComputable: false, reason: 'EMPTY_DECK', currentScore, remainingTotal }
  }

  const counts: Record<Tier, number> = {
    PERFECT: 0, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 0,
  }
  const rankOutcomes = RANKS.map((rank): RankOutcome => {
    const remainingCount = deck[rank]
    const nextScore = score([...hand, rank])
    const tier = classify(nextScore)
    counts[tier] += remainingCount
    return { rank, remainingCount, probability: remainingCount / remainingTotal, nextScore, tier }
  })
  const tierOutcomes = TIER_ORDER.map((tier): TierOutcome => ({
    tier,
    matchingCount: counts[tier],
    probability: counts[tier] / remainingTotal,
  }))
  const burstProbability = counts.BURST / remainingTotal

  return {
    isComputable: true,
    currentScore,
    remainingTotal,
    rankOutcomes,
    tierOutcomes,
    safeProbability: 1 - burstProbability,
    burstProbability,
  }
}

export function formatTierPercentages(counts: readonly number[], total: number): string[] {
  if (!Number.isInteger(total) || total < 0 || !counts.every((count) =>
    Number.isInteger(count) && count >= 0)) {
    throw new RangeError('Counts and total must be nonnegative integers')
  }
  if (total === 0) return counts.map(() => '0.00')
  if (counts.reduce((sum, count) => sum + count, 0) !== total) {
    throw new RangeError('Counts must add up to total')
  }

  const exactUnits = counts.map((count) => count * 10000 / total)
  const units = exactUnits.map(Math.floor)
  const unitsLeft = 10000 - units.reduce((sum, value) => sum + value, 0)
  const remainderOrder = counts.map((_, index) => index).sort((left, right) =>
    (exactUnits[right] - units[right]) - (exactUnits[left] - units[left]) || left - right)
  for (let index = 0; index < unitsLeft; index += 1) {
    units[remainderOrder[index]] += 1
  }
  return units.map((value) => (value / 100).toFixed(2))
}

export function validateDeck(value: unknown): value is Deck {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== RANKS.length || !RANKS.every((rank) => Object.hasOwn(value, rank))) return false

    return RANKS.every((rank) => {
      const count = (value as Record<string, unknown>)[rank]
      return typeof count === 'number'
        && Number.isInteger(count)
        && count >= 0
        && count <= INITIAL_DECK[rank]
    })
  } catch {
    return false
  }
}
