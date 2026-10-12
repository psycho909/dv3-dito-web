import { describe, expect, it } from 'vitest'
import { deriveRemainingDeck, INITIAL_DECK, RANKS, TIER_ORDER, type Deck, type Rank, type Tier } from '../../src/domain'
import {
  DEFAULT_MAX_STATES, DEFAULT_MAX_TIME_MS, getNewDeckForecast, recommendWithinRound,
} from '../../src/domain/recommendation'
import { TIER_SCORES } from '../../src/domain/rules'

const EMPTY_DECK: Deck = {
  A: 0, '2': 0, '3': 0, '4': 0, '5': 0,
  '6': 0, '7': 0, '8': 0, '9': 0, '10': 0,
}

// Independent oracle: physical stones and full hands, with every possible ace
// assignment scored explicitly. No canonical state or cache; tier boundaries
// are expressed here independently while TIER_SCORES supplies the values.
function oracleScore(hand: readonly Rank[]): number {
  let totals = [0]
  for (const rank of hand) {
    totals = totals.flatMap((total) => rank === 'A'
      ? [total + 1, total + 11] : [total + Number(rank)])
  }
  const safe = totals.filter((total) => total <= 21)
  return safe.length ? Math.max(...safe) : Math.min(...totals)
}

function oracleTier(total: number): Tier {
  if (total > 21) return 'BURST'
  if (total === 21) return 'PERFECT'
  if (total >= 19) return 'GREAT'
  if (total >= 16) return 'GOOD'
  return 'NORMAL'
}

type OracleResult = {
  value: number
  action: 'DRAW' | 'STOP'
  stopScore: number
  drawExpectedScore: number
  tierDistribution: Record<Tier, number>
}

function distributionFor(tier: Tier): Record<Tier, number> {
  return { PERFECT: 0, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 0, [tier]: 1 }
}

function oracle(hand: readonly Rank[], stones: readonly Rank[]): OracleResult {
  const total = oracleScore(hand)
  const stopScore = TIER_SCORES[oracleTier(total)]
  if (total >= 21 || stones.length === 0) {
    return {
      value: stopScore,
      action: 'STOP',
      stopScore,
      drawExpectedScore: stopScore,
      tierDistribution: distributionFor(oracleTier(total)),
    }
  }

  let drawExpectedScore = 0
  const drawDistribution = distributionFor('NORMAL')
  TIER_ORDER.forEach((tier) => { drawDistribution[tier] = 0 })
  for (const rank of new Set(stones)) {
    const remainder = [...stones]
    remainder.splice(remainder.indexOf(rank), 1)
    const probability = stones.filter((stone) => stone === rank).length / stones.length
    const child = oracle([...hand, rank], remainder)
    drawExpectedScore += probability * child.value
    TIER_ORDER.forEach((tier) => {
      drawDistribution[tier] += probability * child.tierDistribution[tier]
    })
  }

  const action = total === 0 || drawExpectedScore > stopScore ? 'DRAW' : 'STOP'
  return {
    value: action === 'DRAW' ? drawExpectedScore : stopScore,
    action,
    stopScore,
    drawExpectedScore,
    tierDistribution: action === 'DRAW' ? drawDistribution : distributionFor(oracleTier(total)),
  }
}

function expectDistribution(actual: Record<Tier, number> | undefined, expected: readonly number[]) {
  expect(actual).toBeDefined()
  if (!actual) return
  expect(TIER_ORDER.map((tier) => actual[tier]).reduce((sum, value) => sum + value, 0))
    .toBeCloseTo(1, 12)
  TIER_ORDER.forEach((tier, index) => {
    expect(actual[tier]).toBeGreaterThanOrEqual(0)
    expect(Math.abs(actual[tier] - expected[index]!)).toBeLessThanOrEqual(0.0005)
  })
}

describe('within-round recommendation', () => {
  it('stops after 4, 7, 6 using the exact expected score', () => {
    const hand = ['4', '7', '6'] as const

    const recommendation = recommendWithinRound(hand, deriveRemainingDeck(hand))

    expect(recommendation.action).toBe('STOP')
    expect(recommendation.reason).toBe('STOP_SCORE_HIGHER_OR_TIED')
    expect(recommendation.withinRound?.stopScore).toBe(20)
    expect(recommendation.withinRound?.drawExpectedScore).toBeCloseTo(16.612244897959183, 9)
  })

  it('matches the hand-calculated full-deck case for 10, 6', () => {
    const hand = ['10', '6'] as const

    // The 50 remaining stones group to 4×20, 4×20, 4×50, 4×50, 4×100,
    // and 30×1; the best continuation in each nonterminal branch is to stop.
    const recommendation = recommendWithinRound(hand, deriveRemainingDeck(hand))

    expect(recommendation.action).toBe('STOP')
    expect(recommendation.reason).toBe('STOP_SCORE_HIGHER_OR_TIED')
    expect(recommendation.withinRound?.stopScore).toBe(20)
    expect(recommendation.withinRound?.drawExpectedScore).toBeCloseTo(19.8, 9)
  })

  it.each([
    {
      name: 'full 52-stone deck and empty hand',
      deck: INITIAL_DECK,
      expectedScore: 34.22,
      distribution: [0.116, 0.299, 0.374, 0, 0.211],
    },
    {
      name: 'A–9 twice and 12 tens',
      deck: Object.fromEntries(RANKS.map((rank) => [rank, rank === '10' ? 12 : 2])) as unknown as Deck,
      expectedScore: 34.41,
      distribution: [0.11, 0.329, 0.338, 0, 0.223],
    },
    {
      name: 'A–9 three times and 3 tens',
      deck: Object.fromEntries(RANKS.map((rank) => [rank, 3])) as unknown as Deck,
      expectedScore: 36.62,
      distribution: [0.162, 0.364, 0.094, 0, 0.381],
    },
  ])('returns the ticket forecast for $name', ({ deck, expectedScore, distribution }) => {
    const result = recommendWithinRound([], deck, { now: () => 0 })

    expect(result.action).toBe('DRAW')
    expect(result.forecast?.expectedScore).toBeCloseTo(expectedScore, 2)
    expectDistribution(result.forecast?.tierDistribution, distribution)
  })

  it('calculates and caches the new-deck baseline, and scales the ticket expectation by multiplier', () => {
    const baseline = getNewDeckForecast()
    expect(baseline.forecast?.expectedScore).toBeCloseTo(34.22, 2)
    expect((baseline.forecast?.expectedScore ?? 0) / 10).toBeCloseTo(3.42, 2)
    expect(getNewDeckForecast()).toBe(baseline)

    const deck = Object.fromEntries(RANKS.map((rank) => [rank, 3])) as unknown as Deck
    const result = recommendWithinRound([], deck)
    const expectedScore = result.forecast?.expectedScore ?? 0
    expect(expectedScore).toBeCloseTo(36.62, 2)
    expect(expectedScore / 10).toBeCloseTo(3.66, 2)
    expect(Number((expectedScore * 10).toFixed(1))).toBe(366.2)
  })

  it('gates unsynced states, empty decks, 21, and burst before solving', () => {
    const emptyDeck: Deck = {
      A: 0, '2': 0, '3': 0, '4': 0, '5': 0,
      '6': 0, '7': 0, '8': 0, '9': 0, '10': 0,
    }

    expect(recommendWithinRound([], emptyDeck, { syncState: 'UNSYNCED' })).toEqual({
      action: 'NONE', reason: 'NOT_SYNCED',
    })
    expect(recommendWithinRound([], emptyDeck, { syncState: 'UNINITIALIZED' })).toEqual({
      action: 'NONE', reason: 'NOT_SYNCED',
    })
    expect(recommendWithinRound([], emptyDeck)).toEqual({
      action: 'NONE', reason: 'EMPTY_DECK',
    })
    expect(recommendWithinRound(['A', '10'], deriveRemainingDeck(['A', '10']))).toEqual({
      action: 'NONE', reason: 'AT_21', forecast: {
        expectedScore: 100,
        tierDistribution: { PERFECT: 1, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 0 },
      },
    })
    expect(recommendWithinRound(['10', '10', '2'], deriveRemainingDeck(['10', '10', '2'])))
      .toEqual({ action: 'NONE', reason: 'BURST', forecast: {
        expectedScore: 1,
        tierDistribution: { PERFECT: 0, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 1 },
      } })
  })

  it('discards the entire result on state or time exhaustion, including empty hands', () => {
    const limited = { action: 'NONE', reason: 'COMPUTATION_LIMIT' }
    expect(recommendWithinRound([], INITIAL_DECK, { maxStates: 1 })).toEqual(limited)
    let time = 0
    expect(recommendWithinRound([], INITIAL_DECK, {
      maxTimeMs: 2,
      now: () => time++,
    })).toEqual(limited)
    expect(recommendWithinRound([], INITIAL_DECK, { maxStates: 0 })).toEqual(limited)
    expect(recommendWithinRound([], INITIAL_DECK, { maxTimeMs: 0 })).toEqual(limited)
    const times = [0, 0, 0, 3]
    expect(recommendWithinRound([], { ...EMPTY_DECK, '2': 1 }, {
      maxTimeMs: 2, now: () => times.shift() ?? 3,
    })).toEqual(limited)
    expect(recommendWithinRound([], { ...EMPTY_DECK, '2': 1 }, {
      maxStates: 1, now: () => 0,
    })).toEqual({
      action: 'DRAW', reason: 'ZERO_SCORE_DRAW',
      withinRound: { stopScore: 5, drawExpectedScore: 5 },
      forecast: {
        expectedScore: 5,
        tierDistribution: { PERFECT: 0, GREAT: 0, GOOD: 0, NORMAL: 1, BURST: 0 },
      },
    })
  })

  it('solves fresh 52 and small-rank pools fully with the public default budgets', () => {
    expect(DEFAULT_MAX_STATES).toBe(50_000)
    expect(DEFAULT_MAX_TIME_MS).toBe(200)
    expect(TIER_SCORES).toEqual({ PERFECT: 100, GREAT: 50, GOOD: 20, NORMAL: 5, BURST: 1 })
    for (const deck of [INITIAL_DECK, { ...EMPTY_DECK, A: 4, '2': 4, '3': 4 }]) {
      const result = recommendWithinRound([], deck)
      expect(result.action).toBe('DRAW')
      expect(result.reason).toBe('ZERO_SCORE_DRAW')
      expect(result.withinRound?.stopScore).toBe(5)
      expect(result.withinRound?.drawExpectedScore).toBeGreaterThan(5)
    }
  })

  it('revalues aces after draws and stops on an exact tie', () => {
    expect(recommendWithinRound(['A', '6'], { ...EMPTY_DECK, '10': 1 })).toEqual({
      action: 'STOP', reason: 'STOP_SCORE_HIGHER_OR_TIED',
      withinRound: { stopScore: 20, drawExpectedScore: 20 },
      forecast: {
        expectedScore: 20,
        tierDistribution: { PERFECT: 0, GREAT: 0, GOOD: 1, NORMAL: 0, BURST: 0 },
      },
    })
    expect(recommendWithinRound(['A', 'A', '9', '2'], { ...EMPTY_DECK, '8': 1 })).toEqual({
      action: 'DRAW', reason: 'HIGHER_EXPECTED_SCORE',
      withinRound: { stopScore: 5, drawExpectedScore: 100 },
      forecast: {
        expectedScore: 100,
        tierDistribution: { PERFECT: 1, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 0 },
      },
    })
  })

  it('is deterministic across hand orders and calls, preserves inputs, and releases partial solves', () => {
    const hand = Object.freeze(['A', '6'] as const)
    const deck = Object.freeze({ ...EMPTY_DECK, '4': 1, '10': 1 })
    const expected = recommendWithinRound(hand, deck, { now: () => 0 })
    expect(recommendWithinRound(hand, deck, { maxStates: 0 })).toEqual({
      action: 'NONE', reason: 'COMPUTATION_LIMIT',
    })
    expect(recommendWithinRound(['6', 'A'], deck, { now: () => 0 })).toEqual(expected)
    expect(recommendWithinRound(hand, deck, { now: () => 0 })).toEqual(expected)
    expect(deck).toEqual({ ...EMPTY_DECK, '4': 1, '10': 1 })
    expect(hand).toEqual(['A', '6'])
  })

  it('rejects invalid runtime hands and decks as developer contract errors', () => {
    expect(() => recommendWithinRound(['JOKER' as never], INITIAL_DECK)).toThrow(TypeError)
    expect(() => recommendWithinRound(null as never, INITIAL_DECK)).toThrow(TypeError)
    expect(() => recommendWithinRound(new Array<Rank>(1), INITIAL_DECK)).toThrow(TypeError)
    expect(() => recommendWithinRound(['A', 'A', 'A', 'A', 'A'], INITIAL_DECK)).toThrow(RangeError)
    for (const invalid of [null, [], {}, { ...INITIAL_DECK, A: -1 },
      { ...INITIAL_DECK, A: 1.5 }, { ...INITIAL_DECK, '10': 17 },
      { ...INITIAL_DECK, Joker: 1 }, { ...INITIAL_DECK, A: NaN }]) {
      expect(() => recommendWithinRound([], invalid as never)).toThrow(TypeError)
    }
  })

  it('validates budgets and clock values and does not invoke the clock for gates', () => {
    expect(() => recommendWithinRound([], INITIAL_DECK, { maxStates: -1 })).toThrow(RangeError)
    expect(() => recommendWithinRound([], INITIAL_DECK, { maxStates: 1.5 })).toThrow(RangeError)
    expect(() => recommendWithinRound([], INITIAL_DECK, { maxTimeMs: Infinity })).toThrow(RangeError)
    expect(() => recommendWithinRound([], INITIAL_DECK, { now: () => NaN })).toThrow(RangeError)
    const now = () => { throw new Error('gate must not read clock') }
    expect(recommendWithinRound([], INITIAL_DECK, { syncState: 'UNSYNCED', now }).reason).toBe('NOT_SYNCED')
    expect(recommendWithinRound([], EMPTY_DECK, { now }).reason).toBe('EMPTY_DECK')
    expect(recommendWithinRound(['A', '10'], INITIAL_DECK, { now }).reason).toBe('AT_21')
  })

  it('matches an independent no-memo oracle on 1,000 seeded pools of 1–12 stones', () => {
    let seed = 0x20261008
    function random(bound: number): number {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return Math.floor(seed / 0x100000000 * bound)
    }
    for (let sample = 0; sample < 1000; sample += 1) {
      const bag = RANKS.flatMap((rank) => Array<Rank>(INITIAL_DECK[rank]).fill(rank))
      const hand: Rank[] = []
      const handSize = random(4)
      for (let index = 0; index < handSize; index += 1) {
        const candidate = bag[random(bag.length)]
        if (oracleScore([...hand, candidate]) >= 21) break
        hand.push(candidate)
        bag.splice(bag.indexOf(candidate), 1)
      }
      const stones: Rank[] = []
      const size = 1 + random(12)
      const deck = { ...EMPTY_DECK }
      for (let index = 0; index < size; index += 1) {
        const [rank] = bag.splice(random(bag.length), 1)
        stones.push(rank)
        deck[rank] += 1
      }
      const expected = oracle(hand, stones)
      const actual = recommendWithinRound(hand, deck, { now: () => 0 })
      expect(actual.action, `sample ${sample}`).toBe(expected.action)
      expect(actual.withinRound?.stopScore).toBe(expected.stopScore)
      expect(Math.abs((actual.withinRound?.drawExpectedScore ?? Infinity)
        - expected.drawExpectedScore), `sample ${sample}`).toBeLessThanOrEqual(1e-9)
      expect(actual.forecast?.expectedScore, `sample ${sample}`).toBeCloseTo(expected.value, 9)
      expect(actual.forecast?.tierDistribution, `sample ${sample}`).toEqual(
        expect.objectContaining(Object.fromEntries(TIER_ORDER.map((tier) => [tier,
          expect.closeTo(expected.tierDistribution[tier], 9),
        ]))),
      )
      expect(Object.values(actual.forecast?.tierDistribution ?? {}).reduce((sum, value) => sum + value, 0),
        `sample ${sample} distribution total`).toBeCloseTo(1, 12)
    }
  })
})
