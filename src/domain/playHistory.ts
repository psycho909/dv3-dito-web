import { classify, score, TIER_ORDER, type Tier } from './index'
import type { RoundRecord } from './gameReducer'
import { ROUND_TOKEN_COST, TIER_SCORES } from './rules'

export interface PlayHistorySummary {
  completedRounds: number
  totalScore: number
  averageScore: number | null
  averagePerToken: number | null
  sampleStandardDeviation: number | null
  tierCounts: Readonly<Record<Tier, number>>
  tierPercentages: Readonly<Record<Tier, number>>
}

export interface ScoreInterval {
  lower: number
  upper: number
}

export function summarizePlayHistory(rounds: readonly RoundRecord[]): PlayHistorySummary {
  const completedScores = rounds
    .filter((round) => round.status === 'FINISHED')
    .map((round) => TIER_SCORES[classify(score(round.draws))])
  const completedRounds = completedScores.length
  const totalScore = completedScores.reduce((total, value) => total + value, 0)
  const averageScore = completedRounds > 0 ? totalScore / completedRounds : null
  const tierCounts = Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0])) as Record<Tier, number>

  for (const round of rounds) {
    if (round.status !== 'FINISHED') continue
    const tier = classify(score(round.draws))
    tierCounts[tier] += 1
  }

  return {
    completedRounds,
    totalScore,
    averageScore,
    averagePerToken: averageScore === null ? null : averageScore / ROUND_TOKEN_COST,
    sampleStandardDeviation: sampleStandardDeviation(completedScores),
    tierCounts,
    tierPercentages: Object.fromEntries(TIER_ORDER.map((tier) => [
      tier, completedRounds === 0 ? 0 : tierCounts[tier] / completedRounds,
    ])) as Record<Tier, number>,
  }
}

export function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const squaredDifferences = values.reduce((total, value) => total + (value - mean) ** 2, 0)
  return Math.sqrt(squaredDifferences / (values.length - 1))
}

export function tierScoreVariance(distribution: Readonly<Record<Tier, number>>): number {
  const mean = TIER_ORDER.reduce((total, tier) => total + TIER_SCORES[tier] * distribution[tier], 0)
  return TIER_ORDER.reduce((variance, tier) => {
    const difference = TIER_SCORES[tier] - mean
    return variance + distribution[tier] * difference ** 2
  }, 0)
}

/** Normal-approximation interval for a total across independent rounds, rounded to hundreds. */
export function scoreInterval95(meanPerRound: number, standardDeviation: number, rounds: number): ScoreInterval | null {
  if (!Number.isFinite(meanPerRound) || meanPerRound < 0
    || !Number.isFinite(standardDeviation) || standardDeviation < 0
    || !Number.isSafeInteger(rounds) || rounds < 1) return null

  const expectedTotal = rounds * meanPerRound
  const margin = 1.96 * standardDeviation * Math.sqrt(rounds)
  const roundToHundred = (value: number) => Math.round(value / 100) * 100
  const lower = Math.max(0, roundToHundred(Math.max(0, expectedTotal - margin)))
  const upper = Math.max(lower, roundToHundred(Math.max(0, expectedTotal + margin)))
  return { lower, upper }
}
