import { describe, expect, it } from 'vitest'
import { deriveRemainingDeck, INITIAL_DECK, RANKS, type Deck, type Rank } from '../../src/domain'
import { DEFAULT_MAX_STATES, DEFAULT_MAX_TIME_MS, recommendWithinRound } from '../../src/domain/recommendation'
import { BURST_DISTANCE } from '../../src/domain/rules'

const EMPTY_DECK: Deck = {
  A: 0, '2': 0, '3': 0, '4': 0, '5': 0,
  '6': 0, '7': 0, '8': 0, '9': 0, '10': 0,
}

// Independent oracle: physical stones and full hands, with every possible ace
// assignment scored explicitly. No canonical state, cache, or production scoring.
function oracleScore(hand: readonly Rank[]): number {
  let totals = [0]
  for (const rank of hand) {
    totals = totals.flatMap((total) => rank === 'A'
      ? [total + 1, total + 11] : [total + Number(rank)])
  }
  const safe = totals.filter((total) => total <= 21)
  return safe.length ? Math.max(...safe) : Math.min(...totals)
}

function oracle(hand: readonly Rank[], stones: readonly Rank[]): {
  value: number; action: 'DRAW' | 'STOP'; stopDistance: number; drawExpectedDistance: number
} {
  const total = oracleScore(hand)
  const stopDistance = total > 21 ? 22 : 21 - total
  if (total >= 21 || stones.length === 0) {
    return { value: stopDistance, action: 'STOP', stopDistance, drawExpectedDistance: stopDistance }
  }
  const branches = [...new Set(stones)].map((rank) => {
    const remainder = [...stones]
    remainder.splice(remainder.indexOf(rank), 1)
    const probability = stones.filter((stone) => stone === rank).length / stones.length
    return probability * oracle([...hand, rank], remainder).value
  })
  const drawExpectedDistance = branches.reduce((sum, value) => sum + value, 0)
  const action = drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP'
  return { value: Math.min(stopDistance, drawExpectedDistance), action, stopDistance, drawExpectedDistance }
}

describe('within-round recommendation', () => {
  it('stops after 4, 7, 6 using the exact expected distance', () => {
    const hand = ['4', '7', '6'] as const

    const recommendation = recommendWithinRound(hand, deriveRemainingDeck(hand))

    expect(recommendation.action).toBe('STOP')
    expect(recommendation.reason).toBe('BURST_RISK')
    expect(recommendation.withinRound?.stopDistance).toBe(4)
    expect(recommendation.withinRound?.drawExpectedDistance).toBeCloseTo(
      15.755102040816325,
      9,
    )
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
      action: 'NONE', reason: 'AT_21',
    })
    expect(recommendWithinRound(['10', '10', '2'], deriveRemainingDeck(['10', '10', '2'])))
      .toEqual({ action: 'NONE', reason: 'BURST' })
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
      action: 'DRAW', reason: 'CLOSER_TO_21',
      withinRound: { stopDistance: 21, drawExpectedDistance: 19 },
    })
  })

  it('solves fresh 52 and small-rank pools fully with the public default budgets', () => {
    expect(DEFAULT_MAX_STATES).toBe(50_000)
    expect(DEFAULT_MAX_TIME_MS).toBe(200)
    expect(BURST_DISTANCE).toBe(22)
    for (const deck of [INITIAL_DECK, { ...EMPTY_DECK, A: 4, '2': 4, '3': 4 }]) {
      const result = recommendWithinRound([], deck)
      expect(result.action).toBe('DRAW')
      expect(result.reason).toBe('CLOSER_TO_21')
      expect(result.withinRound?.stopDistance).toBe(21)
      expect(result.withinRound?.drawExpectedDistance).toBeGreaterThan(0)
      expect(result.withinRound?.drawExpectedDistance).toBeLessThan(21)
    }
  })

  it('revalues aces after draws and stops on an exact tie', () => {
    expect(recommendWithinRound(['A', '6'], { ...EMPTY_DECK, '10': 1 })).toEqual({
      action: 'STOP', reason: 'BURST_RISK',
      withinRound: { stopDistance: 4, drawExpectedDistance: 4 },
    })
    expect(recommendWithinRound(['A', 'A', '9', '2'], { ...EMPTY_DECK, '8': 1 })).toEqual({
      action: 'DRAW', reason: 'CLOSER_TO_21',
      withinRound: { stopDistance: 8, drawExpectedDistance: 0 },
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
      expect(actual.withinRound?.stopDistance).toBe(expected.stopDistance)
      expect(Math.abs((actual.withinRound?.drawExpectedDistance ?? Infinity)
        - expected.drawExpectedDistance), `sample ${sample}`).toBeLessThanOrEqual(1e-9)
    }
  })
})
