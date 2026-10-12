import { describe, expect, it } from 'vitest'
import type { RoundRecord } from '../../src/domain/gameReducer'
import {
  sampleStandardDeviation,
  scoreInterval95,
  summarizePlayHistory,
  tierScoreVariance,
} from '../../src/domain/playHistory'

function round(id: string, draws: RoundRecord['draws'], status: RoundRecord['status'] = 'FINISHED'): RoundRecord {
  return {
    id,
    cycleId: 'cycle-1',
    status,
    draws,
    startedAt: '2026-10-12T00:00:00.000Z',
    ...(status === 'FINISHED' ? { finishedAt: '2026-10-12T00:01:00.000Z' } : {}),
  }
}

describe('play history', () => {
  it('derives x1 scores and tier counts from finished rounds only', () => {
    const summary = summarizePlayHistory([
      round('great', ['10', '9']),
      round('good', ['10', '6']),
      round('burst', ['10', '10', '2']),
      round('active', ['A', '10'], 'ACTIVE'),
    ])

    expect(summary.completedRounds).toBe(3)
    expect(summary.totalScore).toBe(71)
    expect(summary.averageScore).toBeCloseTo(71 / 3)
    expect(summary.averagePerToken).toBeCloseTo(71 / 30)
    expect(summary.tierCounts).toEqual({ PERFECT: 0, GREAT: 1, GOOD: 1, NORMAL: 0, BURST: 1 })
    expect(summary.tierPercentages).toEqual({
      PERFECT: 0, GREAT: 1 / 3, GOOD: 1 / 3, NORMAL: 0, BURST: 1 / 3,
    })
  })

  it('returns an empty summary before any completed round', () => {
    expect(summarizePlayHistory([round('active', ['4'], 'ACTIVE')])).toMatchObject({
      completedRounds: 0,
      totalScore: 0,
      averageScore: null,
      averagePerToken: null,
      sampleStandardDeviation: null,
    })
  })

  it('uses sample standard deviation and rounds the 95 percent interval to hundreds', () => {
    expect(sampleStandardDeviation([10, 20, 30])).toBe(10)
    expect(scoreInterval95(100, 10, 100)).toEqual({ lower: 9800, upper: 10200 })
    expect(scoreInterval95(100, 10, 0)).toBeNull()
  })

  it('derives theoretical variance from the five tier scores and probabilities', () => {
    expect(tierScoreVariance({
      PERFECT: 0.1,
      GREAT: 0.2,
      GOOD: 0.3,
      NORMAL: 0.2,
      BURST: 0.2,
    })).toBeCloseTo(885.36)
  })
})
