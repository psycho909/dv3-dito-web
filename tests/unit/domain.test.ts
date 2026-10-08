import { describe, expect, it } from 'vitest'
import {
  classify,
  calculateNextDraw,
  deriveRemainingDeck,
  formatTierPercentages,
  INITIAL_DECK,
  RANKS,
  score,
  TIER_ORDER,
  validateDeck,
} from '../../src/domain'

describe('domain deck', () => {
  it('starts with the 52 stones in the specified rank order', () => {
    expect(RANKS).toEqual(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    expect(INITIAL_DECK).toEqual({
      A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4,
      '7': 4, '8': 4, '9': 4, '10': 16,
    })
    expect(Object.values(INITIAL_DECK).reduce((sum, count) => sum + count, 0)).toBe(52)
    expect(Object.isFrozen(INITIAL_DECK)).toBe(true)
  })

  it('accepts only exact rank keys with integer counts inside initial inventory', () => {
    expect(validateDeck({ ...INITIAL_DECK })).toBe(true)
    expect(validateDeck({ ...INITIAL_DECK, A: 0, '10': 0 })).toBe(true)
    expect(validateDeck(null)).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, A: -1 })).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, A: Number.NaN })).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, A: 1.5 })).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, A: 5 })).toBe(false)
    const missingRank = Object.fromEntries(
      Object.entries(INITIAL_DECK).filter(([rank]) => rank !== 'A'),
    )
    expect(validateDeck(missingRank)).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, Joker: 1 })).toBe(false)
    expect(validateDeck({ ...INITIAL_DECK, [Symbol('extra')]: 1 })).toBe(false)
    const throwingGetter = { ...INITIAL_DECK, get A() { throw new Error('untrusted getter') } }
    expect(validateDeck(throwingGetter)).toBe(false)
  })
})

describe('domain scoring', () => {
  it('scores hands with one flexible ace and classifies every tier boundary', () => {
    expect(score(['A'])).toBe(11)
    expect(score(['A', 'A'])).toBe(12)
    expect(score(['A', 'A', '9'])).toBe(21)
    expect(score(['A', 'A', '9', '2'])).toBe(13)
    expect(score(['A', '10', '2'])).toBe(13)
    expect(score(['10', '10', 'A'])).toBe(21)
    expect(score(['4', '7', '6'])).toBe(17)
    expect(TIER_ORDER).toEqual(['PERFECT', 'GREAT', 'GOOD', 'NORMAL', 'BURST'])
    expect([15, 16, 18, 19, 20, 21, 22].map(classify)).toEqual([
      'NORMAL', 'GOOD', 'GOOD', 'GREAT', 'GREAT', 'PERFECT', 'BURST',
    ])
  })

  it('rejects invalid runtime rank values', () => {
    expect(() => score(['JOKER' as never])).toThrow(TypeError)
  })
})

describe('remaining deck', () => {
  it('derives remaining inventory from the hand without mutating the initial deck', () => {
    const remaining = deriveRemainingDeck(['4', '7', '6'])
    expect(remaining).toEqual({ ...INITIAL_DECK, '4': 3, '6': 3, '7': 3 })
    expect(Object.values(remaining).reduce((sum, count) => sum + count, 0)).toBe(49)
    expect(INITIAL_DECK['4']).toBe(4)
  })

  it('rejects invalid ranks and hands that exceed the initial inventory', () => {
    expect(() => deriveRemainingDeck(['JOKER' as never])).toThrow(TypeError)
    expect(() => deriveRemainingDeck(Array<never>(5).fill('A' as never))).toThrow(RangeError)
    expect(() => deriveRemainingDeck(Array<never>(17).fill('10' as never))).toThrow(RangeError)
  })
})

describe('next draw calculation', () => {
  it('returns exact rank and tier probabilities in fixed tier order', () => {
    const result = calculateNextDraw(['4', '7', '6'], deriveRemainingDeck(['4', '7', '6']))
    expect(result).toEqual({
      isComputable: true,
      currentScore: 17,
      remainingTotal: 49,
      rankOutcomes: [
        { rank: 'A', remainingCount: 4, probability: 4 / 49, nextScore: 18, tier: 'GOOD' },
        { rank: '2', remainingCount: 4, probability: 4 / 49, nextScore: 19, tier: 'GREAT' },
        { rank: '3', remainingCount: 4, probability: 4 / 49, nextScore: 20, tier: 'GREAT' },
        { rank: '4', remainingCount: 3, probability: 3 / 49, nextScore: 21, tier: 'PERFECT' },
        { rank: '5', remainingCount: 4, probability: 4 / 49, nextScore: 22, tier: 'BURST' },
        { rank: '6', remainingCount: 3, probability: 3 / 49, nextScore: 23, tier: 'BURST' },
        { rank: '7', remainingCount: 3, probability: 3 / 49, nextScore: 24, tier: 'BURST' },
        { rank: '8', remainingCount: 4, probability: 4 / 49, nextScore: 25, tier: 'BURST' },
        { rank: '9', remainingCount: 4, probability: 4 / 49, nextScore: 26, tier: 'BURST' },
        { rank: '10', remainingCount: 16, probability: 16 / 49, nextScore: 27, tier: 'BURST' },
      ],
      tierOutcomes: [
        { tier: 'PERFECT', matchingCount: 3, probability: 3 / 49 },
        { tier: 'GREAT', matchingCount: 8, probability: 8 / 49 },
        { tier: 'GOOD', matchingCount: 4, probability: 4 / 49 },
        { tier: 'NORMAL', matchingCount: 0, probability: 0 },
        { tier: 'BURST', matchingCount: 34, probability: 34 / 49 },
      ],
      safeProbability: 15 / 49,
      burstProbability: 34 / 49,
    })
  })

  it('recalculates an ace after the next rank and handles invalid or empty decks', () => {
    const aceResult = calculateNextDraw(['A', '10'], { ...INITIAL_DECK, A: 3, '10': 15 })
    expect(aceResult.isComputable).toBe(true)
    if (aceResult.isComputable) {
      expect(aceResult.currentScore).toBe(21)
      expect(aceResult.rankOutcomes.find(({ rank }) => rank === '2')).toMatchObject({
        nextScore: 13,
        tier: 'NORMAL',
      })
    }
    expect(calculateNextDraw([], { ...INITIAL_DECK, A: -1 })).toEqual({
      isComputable: false,
      reason: 'INVALID_DECK',
      currentScore: 0,
      remainingTotal: 0,
    })
    expect(calculateNextDraw([], Object.fromEntries(RANKS.map((rank) => [rank, 0])))).toEqual({
      isComputable: false,
      reason: 'EMPTY_DECK',
      currentScore: 0,
      remainingTotal: 0,
    })
  })

  it('keeps outcomes valid for deterministic samples of legal hands and decks', () => {
    for (let rotation = 0; rotation < RANKS.length; rotation += 1) {
      const orderedRanks = [...RANKS.slice(rotation), ...RANKS.slice(0, rotation)]
      for (let handSize = 0; handSize <= orderedRanks.length; handSize += 1) {
        const hand = orderedRanks.slice(0, handSize)
        const deck = deriveRemainingDeck(hand)
        const result = calculateNextDraw(hand, deck)
        expect(result.isComputable).toBe(true)
        if (!result.isComputable) continue
        expect(result.rankOutcomes.every(({ probability }) => Number.isFinite(probability) && probability >= 0)).toBe(true)
        expect(result.rankOutcomes.every(({ rank, remainingCount }) =>
          remainingCount >= 0 && remainingCount <= INITIAL_DECK[rank])).toBe(true)
        expect(result.tierOutcomes.reduce((sum, outcome) => sum + outcome.matchingCount, 0))
          .toBe(result.remainingTotal)
        expect(result.tierOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0))
          .toBeCloseTo(1)
      }
    }
  })

  it('reports a depleted rank as zero and formats percentages by largest remainder', () => {
    const hand = ['4', '4', '4', '4'] as const
    const result = calculateNextDraw(hand, deriveRemainingDeck(hand))
    expect(result.isComputable).toBe(true)
    if (result.isComputable) {
      expect(result.rankOutcomes.find(({ rank }) => rank === '4')).toMatchObject({
        remainingCount: 0,
        probability: 0,
      })
    }
    expect(formatTierPercentages([3, 8, 4, 0, 34], 49)).toEqual([
      '6.12', '16.33', '8.16', '0.00', '69.39',
    ])
    expect(formatTierPercentages([0, 0, 0, 0, 0], 0)).toEqual([
      '0.00', '0.00', '0.00', '0.00', '0.00',
    ])
    expect(formatTierPercentages([3, 8, 4, 0, 34], 49)
      .reduce((sum, percentage) => sum + Number(percentage), 0)).toBe(100)
  })
})
