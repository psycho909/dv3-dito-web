import {
  classify,
  deriveRemainingDeck,
  RANKS,
  score,
  validateDeck,
  type Deck,
  type Rank,
} from './index'
import { TIER_SCORES } from './rules'

export type RecommendationAction = 'DRAW' | 'STOP' | 'NONE'
export type RecommendationReason =
  | 'HIGHER_EXPECTED_SCORE'
  | 'STOP_SCORE_HIGHER_OR_TIED'
  | 'ZERO_SCORE_DRAW'
  | 'AT_21'
  | 'BURST'
  | 'NOT_SYNCED'
  | 'EMPTY_DECK'
  | 'COMPUTATION_LIMIT'

export interface Recommendation {
  action: RecommendationAction
  reason: RecommendationReason
  withinRound?: {
    stopScore: number
    drawExpectedScore: number
  }
}

export interface RecommendationOptions {
  syncState?: 'UNINITIALIZED' | 'SYNCED' | 'UNSYNCED'
  /** Unique nonterminal states; terminal leaves are not memoized. Zero disables solving. */
  maxStates?: number
  /** Elapsed milliseconds, checked on every recursive call and before returning. */
  maxTimeMs?: number
  /** Monotonic clock seam; defaults to performance.now. */
  now?: () => number
}

export const DEFAULT_MAX_STATES = 50_000
export const DEFAULT_MAX_TIME_MS = 200

const COUNT_KEY_BASE = 17
const COUNT_KEY_RADIX = COUNT_KEY_BASE ** RANKS.length
const COUNT_KEY_WEIGHTS = RANKS.map((_, index) => COUNT_KEY_BASE ** index)

interface Evaluation {
  value: number
  action: 'DRAW' | 'STOP'
  stopScore: number
  drawExpectedScore: number | null
}

function rankValue(rank: Rank): number {
  return rank === 'A' ? 1 : Number(rank)
}

function effectiveScore(lowTotal: number, hasAce: boolean): number {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal
}

function tierScore(total: number): number {
  return TIER_SCORES[classify(total)]
}

/** Exact within-round policy. Invalid developer inputs throw; limit results have no scores. */
export function recommendWithinRound(
  hand: readonly Rank[],
  deck: Deck,
  options: RecommendationOptions = {},
): Recommendation {
  const currentScore = score(hand)
  // Materialize sparse-array holes so the existing rank validator rejects them.
  deriveRemainingDeck(Array.from(hand))
  if (!validateDeck(deck)) throw new TypeError('Deck must contain valid remaining counts')
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('Options must be an object')
  }
  const syncState = options.syncState ?? 'SYNCED'
  if (!['UNINITIALIZED', 'SYNCED', 'UNSYNCED'].includes(syncState)) {
    throw new TypeError('Invalid sync state')
  }
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES
  const maxTimeMs = options.maxTimeMs ?? DEFAULT_MAX_TIME_MS
  const now = options.now ?? (() => performance.now())
  if (!Number.isSafeInteger(maxStates) || maxStates < 0) {
    throw new RangeError('maxStates must be a nonnegative safe integer')
  }
  if (!Number.isFinite(maxTimeMs) || maxTimeMs < 0) {
    throw new RangeError('maxTimeMs must be a nonnegative finite number')
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function')

  const counts = RANKS.map((rank) => deck[rank])
  // Every valid rank count is below 17, so this mixed-radix number uniquely
  // encodes the remaining deck without allocating a joined string per state.
  let encodedCounts = counts.reduce(
    (encoded, count, index) => encoded + count * COUNT_KEY_WEIGHTS[index],
    0,
  )
  const totalRemaining = counts.reduce((sum, count) => sum + count, 0)
  if (syncState !== 'SYNCED') {
    return { action: 'NONE', reason: 'NOT_SYNCED' }
  }
  if (totalRemaining === 0) return { action: 'NONE', reason: 'EMPTY_DECK' }
  if (currentScore === 21) return { action: 'NONE', reason: 'AT_21' }
  if (currentScore > 21) return { action: 'NONE', reason: 'BURST' }
  // This cache and the mutable working counts belong exclusively to this call.
  const memo = new Map<number, Evaluation>()
  const limit = Symbol('computation limit')
  let states = 0
  function readTime(): number {
    const time = now()
    if (!Number.isFinite(time)) throw new RangeError('now must return a finite number')
    return time
  }
  const startedAt = readTime()
  function checkTime(): void {
    if (readTime() - startedAt >= maxTimeMs) throw limit
  }

  function solve(lowTotal: number, hasAce: boolean, remaining: number): Evaluation {
    checkTime()
    const total = effectiveScore(lowTotal, hasAce)
    const stopScore = tierScore(total)
    if (total >= 21 || remaining === 0) {
      return { value: stopScore, action: 'STOP', stopScore, drawExpectedScore: null }
    }

    const key = encodedCounts + COUNT_KEY_RADIX * (lowTotal * 2 + Number(hasAce))
    const cached = memo.get(key)
    if (cached) return cached
    if (states >= maxStates) throw limit
    states += 1

    let drawExpectedScore = 0
    for (let index = 0; index < RANKS.length; index += 1) {
      const count = counts[index]
      if (count === 0) continue

      counts[index] -= 1
      encodedCounts -= COUNT_KEY_WEIGHTS[index]
      const rank = RANKS[index]
      try {
        drawExpectedScore += count / remaining * solve(
          lowTotal + rankValue(rank),
          hasAce || rank === 'A',
          remaining - 1,
        ).value
      } finally {
        counts[index] += 1
        encodedCounts += COUNT_KEY_WEIGHTS[index]
      }
    }

    const action = total === 0 || drawExpectedScore > stopScore ? 'DRAW' : 'STOP'
    const result: Evaluation = {
      value: action === 'DRAW' ? drawExpectedScore : stopScore,
      action,
      stopScore,
      drawExpectedScore,
    }
    memo.set(key, result)
    return result
  }

  const lowTotal = hand.reduce((sum, rank) => sum + rankValue(rank), 0)
  const hasAce = hand.includes('A')
  let result: Evaluation
  try {
    result = solve(lowTotal, hasAce, totalRemaining)
    checkTime()
  } catch (error) {
    if (error === limit) return { action: 'NONE', reason: 'COMPUTATION_LIMIT' }
    throw error
  }

  return {
    action: result.action,
    reason: result.action === 'STOP'
      ? 'STOP_SCORE_HIGHER_OR_TIED'
      : currentScore === 0 ? 'ZERO_SCORE_DRAW' : 'HIGHER_EXPECTED_SCORE',
    withinRound: {
      stopScore: result.stopScore,
      drawExpectedScore: result.drawExpectedScore ?? result.value,
    },
  }
}
