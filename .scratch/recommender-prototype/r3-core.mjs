// PROTOTYPE — throwaway FR-13 recommender research, ROUND 3.
// Only Node.js built-ins and plain JavaScript are used. This is not product code.

import { performance } from 'node:perf_hooks';

export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
export const VALUES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
export const INITIAL_DECK = Object.freeze([4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
export const BURST_DISTANCE = 22;
export const RESET_THRESHOLD = 15;
export const SCORE_CASES = Object.freeze([
  { hand: ['4', '7', '6'], expected: 17 },
  { hand: ['A'], expected: 11 },
  { hand: ['A', 'A'], expected: 12 },
  { hand: ['A', '9'], expected: 20 },
  { hand: ['A', '10'], expected: 21 },
  { hand: ['A', '10', '2'], expected: 13 },
  { hand: ['A', 'A', '9'], expected: 21 },
  { hand: ['A', 'A', '9', '2'], expected: 13 },
  { hand: ['10', '10', 'A'], expected: 21 },
  { hand: ['10', '10', '2'], expected: 22 },
]);

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values) {
  return values.length === 0 ? Number.NaN : sum(values) / values.length;
}

export function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
}

export function ci95(values) {
  if (values.length === 0) return [Number.NaN, Number.NaN];
  const average = mean(values);
  const halfWidth = values.length < 2
    ? 0
    : 1.96 * Math.sqrt(sampleVariance(values) / values.length);
  return [average - halfWidth, average + halfWidth];
}

export function ciWidth(interval) {
  return interval[1] - interval[0];
}

export function percentile(values, fraction) {
  if (values.length === 0) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function formatNumber(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

export function hash32(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export class SeededRng {
  constructor(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(maxExclusive) {
    return Math.floor(this.nextFloat() * maxExclusive);
  }
}

export function rngFor(label) {
  return new SeededRng(hash32(String(label)));
}

export function cloneDeck(counts) {
  return counts.slice();
}

export function deckTotal(counts) {
  return sum(counts);
}

export function scoreState(lowTotal, hasAce) {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal;
}

export function handState(hand) {
  let lowTotal = 0;
  let hasAce = false;
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0) throw new Error(`Unknown rank: ${rank}`);
    lowTotal += VALUES[index];
    hasAce ||= index === 0;
  }
  return { lowTotal, hasAce, currentScore: scoreState(lowTotal, hasAce) };
}

export function score(hand) {
  return handState(hand).currentScore;
}

export function classify(total) {
  if (total === 21) return 'PERFECT';
  if (total >= 22) return 'BURST';
  if (total >= 19) return 'GREAT';
  if (total >= 16) return 'GOOD';
  return 'NORMAL';
}

export function distance(total) {
  return total >= 22 ? BURST_DISTANCE : 21 - total;
}

export function isSoftState(lowTotal, hasAce) {
  return Boolean(hasAce && lowTotal + 10 <= 21);
}

export function isTerminalScore(currentScore) {
  return currentScore === 21 || currentScore >= 22;
}

export function weightedRankIndex(counts, rng) {
  const total = deckTotal(counts);
  if (total <= 0) return -1;
  let target = rng.nextInt(total);
  for (let index = 0; index < counts.length; index += 1) {
    target -= counts[index];
    if (target < 0) return index;
  }
  return counts.length - 1;
}

export function drawOne(counts, lowTotal, hasAce, rng) {
  const index = weightedRankIndex(counts, rng);
  if (index < 0) return null;
  counts[index] -= 1;
  return {
    index,
    lowTotal: lowTotal + VALUES[index],
    hasAce: hasAce || index === 0,
  };
}

export function encodeDeck(counts) {
  let code = 0;
  let stride = 1;
  for (let index = 0; index < counts.length; index += 1) {
    code += counts[index] * stride;
    stride *= index === 9 ? 17 : 5;
  }
  return code;
}

export function stateKey(counts, lowTotal, hasAce) {
  return `${counts.join(',')}|${lowTotal}|${hasAce ? 1 : 0}`;
}

const DECK_STRIDES = (() => {
  const strides = [];
  let stride = 1;
  for (let index = 0; index < 10; index += 1) {
    strides.push(stride);
    stride *= index === 9 ? 17 : 5;
  }
  return Object.freeze(strides);
})();

export function canonicalKey(deckCode, lowTotal, hasAce) {
  return ((deckCode * 128 + lowTotal) * 2) + (hasAce ? 1 : 0);
}

export const INITIAL_DECK_CODE = encodeDeck(INITIAL_DECK);

export function deckAfterHand(hand) {
  const counts = cloneDeck(INITIAL_DECK);
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0 || counts[index] <= 0) throw new Error(`Illegal hand: ${hand.join(',')}`);
    counts[index] -= 1;
  }
  return { counts, deckCode: encodeDeck(counts) };
}

export function makeDeckOrder(label) {
  const cards = [];
  for (let index = 0; index < INITIAL_DECK.length; index += 1) {
    for (let count = 0; count < INITIAL_DECK[index]; count += 1) cards.push(index);
  }
  const rng = rngFor(`deck-order|${label}`);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

export function drawFromOrder(order, cursor, counts, lowTotal, hasAce) {
  while (cursor < order.length) {
    const index = order[cursor];
    cursor += 1;
    if (counts[index] <= 0) continue;
    counts[index] -= 1;
    return {
      cursor,
      index,
      lowTotal: lowTotal + VALUES[index],
      hasAce: hasAce || index === 0,
    };
  }
  return null;
}

export class RoundBudgetExceeded extends Error {
  constructor(reason, elapsedMs, newStates, solveCalls) {
    super(`L1 round budget exceeded: ${reason}`);
    this.name = 'RoundBudgetExceeded';
    this.reason = reason;
    this.elapsedMs = elapsedMs;
    this.newStates = newStates;
    this.solveCalls = solveCalls;
  }
}

// The cache is deliberately scoped to one round. It is cleared in endRound(),
// so a new 52-card cycle cannot inflate one process-wide memo indefinitely.
export class RoundL1Solver {
  constructor({ maxStates = 100000, maxMs = 10000 } = {}) {
    this.maxStates = maxStates;
    this.maxMs = maxMs;
    this.cache = new Map();
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalSolveCalls = 0;
    this.completedRounds = 0;
    this.roundMetrics = [];
    this.active = false;
  }

  beginRound() {
    this.cache.clear();
    this.roundHits = 0;
    this.roundMisses = 0;
    this.roundSolveCalls = 0;
    this.roundStartedAt = performance.now();
    this.active = true;
  }

  endRound() {
    const elapsedMs = performance.now() - this.roundStartedAt;
    const metric = {
      cacheStates: this.cache.size,
      cacheHits: this.roundHits,
      cacheMisses: this.roundMisses,
      solveCalls: this.roundSolveCalls,
      elapsedMs,
    };
    this.roundMetrics.push(metric);
    this.completedRounds += 1;
    this.cache.clear();
    this.active = false;
    return metric;
  }

  checkBudget() {
    const elapsedMs = performance.now() - this.roundStartedAt;
    if (elapsedMs > this.maxMs) {
      throw new RoundBudgetExceeded('elapsed time limit', elapsedMs, this.cache.size, this.roundSolveCalls);
    }
    if (this.cache.size >= this.maxStates) {
      throw new RoundBudgetExceeded('per-round cache state limit', elapsedMs, this.cache.size, this.roundSolveCalls);
    }
  }

  solve(counts, lowTotal, hasAce, deckCode = encodeDeck(counts)) {
    if (!this.active) this.beginRound();
    this.totalSolveCalls += 1;
    this.roundSolveCalls += 1;
    const key = canonicalKey(deckCode, lowTotal, hasAce);
    const cached = this.cache.get(key);
    if (cached) {
      this.totalHits += 1;
      this.roundHits += 1;
      return cached;
    }
    this.totalMisses += 1;
    this.roundMisses += 1;
    this.checkBudget();

    const currentScore = scoreState(lowTotal, hasAce);
    const stopDistance = distance(currentScore);
    if (isTerminalScore(currentScore)) {
      const terminal = {
        value: stopDistance,
        action: 'STOP',
        stopDistance,
        drawExpectedDistance: stopDistance,
      };
      this.cache.set(key, terminal);
      return terminal;
    }

    const remaining = deckTotal(counts);
    if (remaining === 0) {
      const empty = {
        value: stopDistance,
        action: 'STOP',
        stopDistance,
        drawExpectedDistance: Number.POSITIVE_INFINITY,
      };
      this.cache.set(key, empty);
      return empty;
    }

    let drawExpectedDistance = 0;
    for (let index = 0; index < counts.length; index += 1) {
      const count = counts[index];
      if (count === 0) continue;
      counts[index] -= 1;
      const child = this.solve(
        counts,
        lowTotal + VALUES[index],
        hasAce || index === 0,
        deckCode - DECK_STRIDES[index],
      );
      counts[index] += 1;
      drawExpectedDistance += (count / remaining) * child.value;
    }

    const result = {
      value: Math.min(stopDistance, drawExpectedDistance),
      action: drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP',
      stopDistance,
      drawExpectedDistance,
    };
    this.cache.set(key, result);
    return result;
  }

  decision(counts, lowTotal, hasAce, deckCode = encodeDeck(counts)) {
    const currentScore = scoreState(lowTotal, hasAce);
    const remaining = deckTotal(counts);
    if (currentScore === 0) {
      return {
        action: 'DRAW',
        stopDistance: distance(currentScore),
        drawExpectedDistance: Number.NaN,
        value: Number.NaN,
      };
    }
    if (isTerminalScore(currentScore) || remaining === 0) {
      const stopDistance = distance(currentScore);
      return {
        action: 'STOP',
        stopDistance,
        drawExpectedDistance: remaining === 0 ? Number.POSITIVE_INFINITY : stopDistance,
        value: stopDistance,
      };
    }
    return this.solve(counts, lowTotal, hasAce, deckCode);
  }

  stats() {
    return {
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      totalSolveCalls: this.totalSolveCalls,
      completedRounds: this.completedRounds,
      cacheStates: this.cache.size,
      roundMetrics: this.roundMetrics.slice(),
    };
  }
}

export function bruteSolve(counts, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  const stopDistance = distance(currentScore);
  const remaining = deckTotal(counts);
  if (isTerminalScore(currentScore) || remaining === 0) {
    return {
      value: stopDistance,
      action: 'STOP',
      stopDistance,
      drawExpectedDistance: remaining === 0 ? Number.POSITIVE_INFINITY : stopDistance,
    };
  }
  let drawExpectedDistance = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count === 0) continue;
    counts[index] -= 1;
    const child = bruteSolve(counts, lowTotal + VALUES[index], hasAce || index === 0);
    counts[index] += 1;
    drawExpectedDistance += (count / remaining) * child.value;
  }
  return {
    value: Math.min(stopDistance, drawExpectedDistance),
    action: drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP',
    stopDistance,
    drawExpectedDistance,
  };
}

export function makeRandomLegalState(rng, maxRemaining = 12) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const available = cloneDeck(INITIAL_DECK);
    const hand = [];
    const handLength = 1 + rng.nextInt(5);
    for (let draw = 0; draw < handLength; draw += 1) {
      const index = weightedRankIndex(available, rng);
      if (index < 0) break;
      available[index] -= 1;
      hand.push(RANKS[index]);
    }
    const state = handState(hand);
    if (state.currentScore <= 0 || state.currentScore >= 21) continue;
    const target = 1 + rng.nextInt(Math.min(maxRemaining, deckTotal(available)));
    while (deckTotal(available) > target) {
      const index = weightedRankIndex(available, rng);
      if (index < 0) break;
      available[index] -= 1;
    }
    return {
      hand,
      counts: available,
      deckCode: encodeDeck(available),
      lowTotal: state.lowTotal,
      hasAce: state.hasAce,
      currentScore: state.currentScore,
    };
  }
  const hand = ['2'];
  const state = handState(hand);
  const deck = deckAfterHand(hand);
  return { hand, ...deck, ...state };
}

export function baseAction(currentScore, remaining) {
  if (currentScore === 0) return 'DRAW';
  if (isTerminalScore(currentScore) || remaining === 0) return 'STOP';
  return null;
}

export function simulateRoundL1({
  solver,
  counts,
  deckCode = encodeDeck(counts),
  lowTotal = 0,
  hasAce = false,
  rng = null,
  cardOrder = null,
  orderCursor = 0,
  onDecision = null,
}) {
  solver.beginRound();
  let cursor = orderCursor;
  let lastDecision = null;
  while (true) {
    const currentScore = scoreState(lowTotal, hasAce);
    const remaining = deckTotal(counts);
    const decision = solver.decision(counts, lowTotal, hasAce, deckCode);
    lastDecision = decision;
    if (onDecision && currentScore > 0 && currentScore < 21 && remaining > 0) {
      onDecision({
        counts: cloneDeck(counts),
        deckCode,
        lowTotal,
        hasAce,
        currentScore,
        remaining,
        l1: { ...decision },
      });
    }
    if (decision.action !== 'DRAW' || remaining === 0) break;
    const drawn = cardOrder
      ? drawFromOrder(cardOrder, cursor, counts, lowTotal, hasAce)
      : drawOne(counts, lowTotal, hasAce, rng);
    if (!drawn) break;
    if (cardOrder) cursor = drawn.cursor;
    deckCode -= DECK_STRIDES[drawn.index];
    lowTotal = drawn.lowTotal;
    hasAce = drawn.hasAce;
  }
  const currentScore = scoreState(lowTotal, hasAce);
  const metric = solver.endRound();
  return {
    distance: distance(currentScore),
    score: currentScore,
    lowTotal,
    hasAce,
    deckCode,
    orderCursor: cursor,
    l1: lastDecision,
    cacheMetric: metric,
  };
}

export function simulateCycleL1({
  solver,
  seedLabel = 'cycle',
  rng = rngFor(seedLabel),
  cardOrder = null,
  startCounts = INITIAL_DECK,
  startLowTotal = 0,
  startHasAce = false,
  onDecision = null,
}) {
  const counts = cloneDeck(startCounts);
  let deckCode = encodeDeck(counts);
  let lowTotal = startLowTotal;
  let hasAce = startHasAce;
  let cursor = 0;
  const roundDistances = [];
  const roundScores = [];
  const roundMetrics = [];

  while (true) {
    const round = simulateRoundL1({
      solver,
      counts,
      deckCode,
      lowTotal,
      hasAce,
      rng,
      cardOrder,
      orderCursor: cursor,
      onDecision,
    });
    deckCode = round.deckCode;
    lowTotal = round.lowTotal;
    hasAce = round.hasAce;
    cursor = round.orderCursor;
    roundDistances.push(round.distance);
    roundScores.push(round.score);
    roundMetrics.push(round.cacheMetric);
    if (deckTotal(counts) < RESET_THRESHOLD) break;
    lowTotal = 0;
    hasAce = false;
  }
  return {
    roundDistances,
    roundScores,
    roundCount: roundDistances.length,
    totalDistance: sum(roundDistances),
    averageDistance: mean(roundDistances),
    remainingAtEnd: deckTotal(counts),
    roundMetrics,
    countsAtEnd: counts,
  };
}

export function policyAction(policy, counts, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  const remaining = deckTotal(counts);
  const fixed = baseAction(currentScore, remaining);
  if (fixed) return fixed;
  return policy({ counts, lowTotal, hasAce, currentScore, remaining });
}

export function simulateCycleApprox({
  policy,
  seedLabel = 'approx-cycle',
  rng = rngFor(seedLabel),
  cardOrder = null,
  startCounts = INITIAL_DECK,
  startLowTotal = 0,
  startHasAce = false,
}) {
  const counts = cloneDeck(startCounts);
  let deckCode = encodeDeck(counts);
  let lowTotal = startLowTotal;
  let hasAce = startHasAce;
  let cursor = 0;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    while (true) {
      const currentScore = scoreState(lowTotal, hasAce);
      const remaining = deckTotal(counts);
      const action = policyAction(policy, counts, lowTotal, hasAce);
      if (action !== 'DRAW' || remaining === 0) {
        roundDistances.push(distance(currentScore));
        roundScores.push(currentScore);
        break;
      }
      const drawn = cardOrder
        ? drawFromOrder(cardOrder, cursor, counts, lowTotal, hasAce)
        : drawOne(counts, lowTotal, hasAce, rng);
      if (!drawn) {
        roundDistances.push(distance(currentScore));
        roundScores.push(currentScore);
        break;
      }
      if (cardOrder) cursor = drawn.cursor;
      deckCode -= DECK_STRIDES[drawn.index];
      lowTotal = drawn.lowTotal;
      hasAce = drawn.hasAce;
    }
    if (deckTotal(counts) < RESET_THRESHOLD) break;
    lowTotal = 0;
    hasAce = false;
  }
  return {
    roundDistances,
    roundScores,
    roundCount: roundDistances.length,
    totalDistance: sum(roundDistances),
    averageDistance: mean(roundDistances),
    remainingAtEnd: deckTotal(counts),
  };
}

export function simulateCycleFromStateApprox({ policy, state, rng, firstAction }) {
  const counts = cloneDeck(state.counts);
  let lowTotal = state.lowTotal;
  let hasAce = state.hasAce;
  let first = firstAction;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    if (first === 'DRAW') {
      const drawn = drawOne(counts, lowTotal, hasAce, rng);
      first = null;
      if (drawn) {
        lowTotal = drawn.lowTotal;
        hasAce = drawn.hasAce;
      }
    }
    if (first === 'STOP') {
      const currentScore = scoreState(lowTotal, hasAce);
      roundDistances.push(distance(currentScore));
      roundScores.push(currentScore);
      first = null;
    } else {
      while (true) {
        const currentScore = scoreState(lowTotal, hasAce);
        const remaining = deckTotal(counts);
        const action = policyAction(policy, counts, lowTotal, hasAce);
        if (action !== 'DRAW' || remaining === 0) {
          roundDistances.push(distance(currentScore));
          roundScores.push(currentScore);
          break;
        }
        const drawn = drawOne(counts, lowTotal, hasAce, rng);
        if (!drawn) {
          roundDistances.push(distance(currentScore));
          roundScores.push(currentScore);
          break;
        }
        lowTotal = drawn.lowTotal;
        hasAce = drawn.hasAce;
      }
    }
    if (deckTotal(counts) < RESET_THRESHOLD) break;
    lowTotal = 0;
    hasAce = false;
  }
  return {
    roundDistances,
    roundScores,
    roundCount: roundDistances.length,
    totalDistance: sum(roundDistances),
    averageDistance: mean(roundDistances),
    remainingAtEnd: deckTotal(counts),
  };
}

export function isCiExcludingZero(interval) {
  return Number.isFinite(interval[0]) && (interval[0] > 0 || interval[1] < 0);
}

export function evaluateL2({
  state,
  policy,
  lambda,
  maxRollouts = 2000,
  seedLabel = 'l2',
  commonRandomNumbers = true,
  sequential = true,
  minRolloutsForStop = 30,
  maxMs = Number.POSITIVE_INFINITY,
}) {
  const stateSeed = hash32(`${stateKey(state.counts, state.lowTotal, state.hasAce)}|${seedLabel}`);
  const seed = `0x${stateSeed.toString(16).padStart(8, '0')}`;
  const differences = [];
  const drawCosts = [];
  const stopCosts = [];
  const started = performance.now();
  let stoppedEarly = false;
  let abortReason = null;

  for (let index = 0; index < maxRollouts; index += 1) {
    if (performance.now() - started > maxMs) {
      abortReason = `L2 elapsed>${maxMs}ms`;
      break;
    }
    const pairLabel = `${stateSeed}|rollout|${index}`;
    const drawRng = rngFor(commonRandomNumbers ? pairLabel : `${pairLabel}|DRAW`);
    const stopRng = rngFor(commonRandomNumbers ? pairLabel : `${pairLabel}|STOP`);
    const drawResult = simulateCycleFromStateApprox({ policy, state, rng: drawRng, firstAction: 'DRAW' });
    const stopResult = simulateCycleFromStateApprox({ policy, state, rng: stopRng, firstAction: 'STOP' });
    const drawCost = drawResult.totalDistance - lambda * drawResult.roundCount;
    const stopCost = stopResult.totalDistance - lambda * stopResult.roundCount;
    drawCosts.push(drawCost);
    stopCosts.push(stopCost);
    differences.push(drawCost - stopCost);

    if (sequential && differences.length >= minRolloutsForStop) {
      const interval = ci95(differences);
      if (isCiExcludingZero(interval)) {
        stoppedEarly = differences.length < maxRollouts;
        break;
      }
    }
  }

  const complete = differences.length === maxRollouts || (sequential && stoppedEarly);
  const interval = ci95(differences);
  return {
    seed,
    seedValue: stateSeed,
    requestedRollouts: maxRollouts,
    completedRollouts: differences.length,
    complete,
    stoppedEarly,
    aborted: !complete,
    abortReason: complete ? null : (abortReason || `completed ${differences.length}/${maxRollouts}`),
    drawMinusStop: complete ? mean(differences) : Number.NaN,
    ci95: complete ? interval : [Number.NaN, Number.NaN],
    ciWidth: complete ? ciWidth(interval) : Number.NaN,
    l2Action: complete ? (mean(differences) < 0 ? 'DRAW' : 'STOP') : null,
    drawCostMean: complete ? mean(drawCosts) : Number.NaN,
    stopCostMean: complete ? mean(stopCosts) : Number.NaN,
    elapsedMs: performance.now() - started,
    commonRandomNumbers,
    rawDifferenceSample: differences,
  };
}

export function remainingBucket(remaining) {
  if (remaining < 15) return '<15';
  if (remaining < 20) return '15–19';
  if (remaining < 30) return '20–29';
  if (remaining < 40) return '30–39';
  return '≥40';
}

export function tenRatioBucket(counts) {
  const ratio = counts[9] / Math.max(1, deckTotal(counts));
  if (ratio < 0.25) return '<25%';
  if (ratio < 0.35) return '25–34%';
  return '≥35%';
}

function representativeHands() {
  const found = new Map();
  const counts = cloneDeck(INITIAL_DECK);
  const hand = [];
  const visit = (depth, lowTotal, hasAce) => {
    const currentScore = scoreState(lowTotal, hasAce);
    if (currentScore > 0 && currentScore < 21) {
      const soft = isSoftState(lowTotal, hasAce);
      const key = `${soft ? 'soft' : 'hard'}|${currentScore}`;
      if (!found.has(key)) {
        found.set(key, {
          hand: hand.slice(),
          counts: cloneDeck(counts),
          deckCode: encodeDeck(counts),
          lowTotal,
          hasAce,
          currentScore,
        });
      }
    }
    if (depth >= 4 || found.size >= 40) return;
    for (let index = 0; index < RANKS.length; index += 1) {
      if (counts[index] === 0) continue;
      counts[index] -= 1;
      hand.push(RANKS[index]);
      visit(depth + 1, lowTotal + VALUES[index], hasAce || index === 0);
      hand.pop();
      counts[index] += 1;
      if (found.size >= 40) return;
    }
  };
  visit(0, 0, false);
  return [...found.values()];
}

export function buildFixedThresholdDefinition() {
  const solver = new RoundL1Solver();
  const representatives = representativeHands();
  const actions = { hard: {}, soft: {} };
  const values = { hard: {}, soft: {} };
  for (const state of representatives) {
    solver.beginRound();
    const result = solver.decision(state.counts, state.lowTotal, state.hasAce, state.deckCode);
    solver.endRound();
    const kind = isSoftState(state.lowTotal, state.hasAce) ? 'soft' : 'hard';
    actions[kind][String(state.currentScore)] = result.action;
    values[kind][String(state.currentScore)] = {
      hand: state.hand,
      stopDistance: result.stopDistance,
      drawExpectedDistance: result.drawExpectedDistance,
    };
  }
  const stopAt = {};
  for (const kind of ['hard', 'soft']) {
    const scores = Object.keys(actions[kind]).map(Number).sort((a, b) => a - b);
    const firstStop = scores.find((value) => actions[kind][String(value)] === 'STOP');
    stopAt[kind] = firstStop ?? 21;
  }
  return {
    type: 'fixed-threshold',
    name: 'fixed-threshold-hard-soft',
    stopAt,
    actions,
    representatives: values,
    derivation: '每個 hard/soft 分數代表狀態以全新 52 顆牌池上的 exact L1 推得；再取第一個 STOP 分數作固定門檻。',
  };
}

function fixedThresholdAction(definition, counts, lowTotal, hasAce, currentScore) {
  const kind = isSoftState(lowTotal, hasAce) ? 'soft' : 'hard';
  const threshold = definition.stopAt[kind] ?? 21;
  return currentScore >= threshold ? 'STOP' : 'DRAW';
}

export function buildCompositionDefinition(calibrationPoints, fallbackDefinition, minSamples = 5) {
  const groups = new Map();
  for (const point of calibrationPoints) {
    const soft = isSoftState(point.lowTotal, point.hasAce);
    const key = `${soft ? 'soft' : 'hard'}|${point.currentScore}|${remainingBucket(point.remaining)}|${tenRatioBucket(point.counts)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, soft: soft ? 'soft' : 'hard', score: point.currentScore, draw: 0, stop: 0, total: 0 };
      groups.set(key, group);
    }
    group[point.l1.action === 'STOP' ? 'stop' : 'draw'] += 1;
    group.total += 1;
  }
  const buckets = {};
  for (const group of groups.values()) {
    const bucketKey = `${group.soft}|${remainingBucketFromKey(group.key)}|${tenRatioBucketFromKey(group.key)}`;
    let bucket = buckets[bucketKey];
    if (!bucket) {
      bucket = { key: bucketKey, scores: {}, total: 0 };
      buckets[bucketKey] = bucket;
    }
    bucket.total += group.total;
    bucket.scores[String(group.score)] = {
      draw: group.draw,
      stop: group.stop,
      total: group.total,
    };
  }
  for (const bucket of Object.values(buckets)) {
    const stopScores = Object.entries(bucket.scores)
      .filter(([, value]) => value.total >= minSamples && value.stop > value.draw)
      .map(([scoreValue]) => Number(scoreValue))
      .sort((a, b) => a - b);
    bucket.stopAt = stopScores[0] ?? null;
    bucket.minSamples = minSamples;
  }
  return {
    type: 'composition-threshold',
    name: 'remaining-and-ten-ratio-buckets',
    minSamples,
    fallback: fallbackDefinition,
    buckets,
    derivation: '以 exact L1 軌跡的剩餘數分桶與 10 點比例分桶，對每個分數取多數 action 的第一個 STOP 作門檻；樣本不足回退 fixed threshold。',
  };
}

function remainingBucketFromKey(key) {
  return key.split('|')[2];
}

function tenRatioBucketFromKey(key) {
  return key.split('|')[3];
}

export function policyFromDefinition(definition) {
  if (definition.type === 'fixed-threshold') {
    return ({ counts, lowTotal, hasAce, currentScore }) => fixedThresholdAction(definition, counts, lowTotal, hasAce, currentScore);
  }
  if (definition.type === 'composition-threshold') {
    const fallback = policyFromDefinition(definition.fallback);
    return ({ counts, lowTotal, hasAce, currentScore, remaining }) => {
      const soft = isSoftState(lowTotal, hasAce);
      const key = `${soft ? 'soft' : 'hard'}|${remainingBucket(remaining)}|${tenRatioBucket(counts)}`;
      const bucket = definition.buckets[key];
      if (bucket && bucket.stopAt !== null && bucket.total >= definition.minSamples) {
        return currentScore >= bucket.stopAt ? 'STOP' : 'DRAW';
      }
      return fallback({ counts, lowTotal, hasAce, currentScore, remaining });
    };
  }
  throw new Error(`Unknown strategy definition: ${definition.type}`);
}

export function strategyFallbackRate(definition, points) {
  if (definition.type !== 'composition-threshold') return 0;
  let fallbackCount = 0;
  for (const point of points) {
    const soft = isSoftState(point.lowTotal, point.hasAce);
    const key = `${soft ? 'soft' : 'hard'}|${remainingBucket(point.remaining)}|${tenRatioBucket(point.counts)}`;
    const bucket = definition.buckets[key];
    if (!bucket || bucket.stopAt === null || bucket.total < definition.minSamples) fallbackCount += 1;
  }
  return points.length === 0 ? Number.NaN : fallbackCount / points.length;
}

export function exactNextDraw(hand, counts) {
  const remaining = deckTotal(counts);
  const tierCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, NORMAL: 0, BURST: 0 };
  const rankOutcomes = RANKS.map((rank, index) => {
    const nextScore = score([...hand, rank]);
    const tier = classify(nextScore);
    tierCounts[tier] += counts[index];
    return {
      rank,
      count: counts[index],
      probability: counts[index] / remaining,
      nextScore,
      tier,
    };
  });
  return { currentScore: score(hand), remaining, rankOutcomes, tierCounts };
}

export function serializePoint(point) {
  return {
    counts: point.counts,
    deckCode: point.deckCode,
    lowTotal: point.lowTotal,
    hasAce: point.hasAce,
    currentScore: point.currentScore,
    remaining: point.remaining,
    l1: point.l1,
  };
}

export function summarizeTimes(times) {
  return {
    count: times.length,
    p50: percentile(times, 0.5),
    p95: percentile(times, 0.95),
    max: times.length ? Math.max(...times) : Number.NaN,
    mean: mean(times),
  };
}
