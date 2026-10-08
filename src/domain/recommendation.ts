import {
  deriveRemainingDeck,
  RANKS,
  score,
  validateDeck,
  type Deck,
  type Rank,
} from './index'
import { BURST_DISTANCE } from './rules'

export type RecommendationAction = 'DRAW' | 'STOP' | 'NONE'
export type RecommendationReason =
  | 'CLOSER_TO_21'
  | 'BURST_RISK'
  | 'AT_21'
  | 'BURST'
  | 'NOT_SYNCED'
  | 'EMPTY_DECK'
  | 'COMPUTATION_LIMIT'

export interface Recommendation {
  action: RecommendationAction
  reason: RecommendationReason
  withinRound?: {
    stopDistance: number
    drawExpectedDistance: number
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

interface Evaluation {
  value: number
  action: 'DRAW' | 'STOP'
  stopDistance: number
  drawExpectedDistance: number | null
}

function rankValue(rank: Rank): number {
  return rank === 'A' ? 1 : Number(rank)
}

function effectiveScore(lowTotal: number, hasAce: boolean): number {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal
}

function distance(total: number): number {
  return total > 21 ? BURST_DISTANCE : 21 - total
}

/** Exact within-round policy. Invalid developer inputs throw; limit results have no distances. */
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
  const totalRemaining = counts.reduce((sum, count) => sum + count, 0)
  if (syncState !== 'SYNCED') {
    return { action: 'NONE', reason: 'NOT_SYNCED' }
  }
  if (totalRemaining === 0) return { action: 'NONE', reason: 'EMPTY_DECK' }
  if (currentScore === 21) return { action: 'NONE', reason: 'AT_21' }
  if (currentScore > 21) return { action: 'NONE', reason: 'BURST' }
  // This cache and the mutable working counts belong exclusively to this call.
  const memo = new Map<string, Evaluation>()
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
    const stopDistance = distance(total)
    if (total >= 21 || remaining === 0) {
      return { value: stopDistance, action: 'STOP', stopDistance, drawExpectedDistance: null }
    }

    const key = `${counts.join(',')}|${lowTotal}|${hasAce ? 1 : 0}`
    const cached = memo.get(key)
    if (cached) return cached
    if (states >= maxStates) throw limit
    states += 1

    let drawExpectedDistance = 0
    for (let index = 0; index < RANKS.length; index += 1) {
      const count = counts[index]
      if (count === 0) continue

      counts[index] -= 1
      const rank = RANKS[index]
      try {
        drawExpectedDistance += count / remaining * solve(
          lowTotal + rankValue(rank),
          hasAce || rank === 'A',
          remaining - 1,
        ).value
      } finally {
        counts[index] += 1
      }
    }

    const action = total === 0 || drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP'
    const result: Evaluation = {
      value: action === 'DRAW' ? drawExpectedDistance : stopDistance,
      action,
      stopDistance,
      drawExpectedDistance,
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
    reason: result.action === 'DRAW' ? 'CLOSER_TO_21' : 'BURST_RISK',
    withinRound: {
      stopDistance: result.stopDistance,
      drawExpectedDistance: result.drawExpectedDistance ?? result.value,
    },
  }
}
