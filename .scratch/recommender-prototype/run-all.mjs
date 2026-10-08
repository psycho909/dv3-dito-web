// PROTOTYPE — throwaway recommender engine experiment.
// This file is intentionally isolated under .scratch and must not become a product dependency.

import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROTOTYPE_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(PROTOTYPE_DIR, 'REPORT.md');
const PERFORMANCE_RESULT_PATH = join(PROTOTYPE_DIR, 'performance-result.json');
mkdirSync(PROTOTYPE_DIR, { recursive: true });

const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
const VALUES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const INITIAL_DECK = Object.freeze([4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
const BURST_DISTANCE = 22;
const RESET_THRESHOLD = 15;
const TIER_NAMES = Object.freeze(['PERFECT', 'GREAT', 'GOOD', 'NORMAL', 'BURST']);
const SCORE_CASES = Object.freeze([
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

const SCALE = Number.isFinite(Number(process.env.PROTOTYPE_SCALE))
  ? Math.max(0.001, Number(process.env.PROTOTYPE_SCALE))
  : 1;
const scaled = (value) => Math.max(1, Math.round(value * SCALE));
const CONFIG = Object.freeze({
  performanceRandomStates: scaled(2000),
  performanceSmallHeavyStates: scaled(20),
  performanceLowScoreStates: scaled(10),
  bruteCases: scaled(1000),
  baselineCycles: scaled(2000),
  decisionPoints: scaled(3000),
  l2BulkRollouts: scaled(256),
  l2FullRollouts: scaled(2000),
  l2FullSampleStates: scaled(3),
  seedSensitivityStates: scaled(300),
  comparisonCycles: scaled(300),
});

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function cloneDeck(deck) {
  return deck.slice();
}

function deckTotal(deck) {
  return sum(deck);
}

function score(hand) {
  let lowTotal = 0;
  let hasAce = false;
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0) throw new Error(`Unknown rank: ${rank}`);
    lowTotal += VALUES[index];
    hasAce ||= index === 0;
  }
  return scoreState(lowTotal, hasAce);
}

function scoreState(lowTotal, hasAce) {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal;
}

function classify(total) {
  if (total === 21) return 'PERFECT';
  if (total >= 22) return 'BURST';
  if (total >= 19) return 'GREAT';
  if (total >= 16) return 'GOOD';
  return 'NORMAL';
}

function distance(total) {
  return total >= 22 ? BURST_DISTANCE : 21 - total;
}

function stateKey(counts, lowTotal, hasAce) {
  return `${counts.join(',')}|${lowTotal}|${hasAce ? 1 : 0}`;
}

function formatNumber(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function percentile(values, fraction) {
  if (values.length === 0) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values) {
  return values.length === 0 ? Number.NaN : sum(values) / values.length;
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
}

function ci95(values) {
  if (values.length === 0) return [Number.NaN, Number.NaN];
  const average = mean(values);
  const halfWidth = values.length < 2
    ? 0
    : 1.96 * Math.sqrt(sampleVariance(values) / values.length);
  return [average - halfWidth, average + halfWidth];
}

function ciWidth(ci) {
  return ci[1] - ci[0];
}

function hash32(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

class SeededRng {
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

function rngFor(label) {
  return new SeededRng(hash32(label));
}

function weightedRankIndex(counts, rng) {
  const total = deckTotal(counts);
  if (total <= 0) return -1;
  let target = rng.nextInt(total);
  for (let index = 0; index < counts.length; index += 1) {
    target -= counts[index];
    if (target < 0) return index;
  }
  return counts.length - 1;
}

function drawOne(counts, lowTotal, hasAce, rng) {
  const index = weightedRankIndex(counts, rng);
  if (index < 0) return null;
  counts[index] -= 1;
  return {
    index,
    lowTotal: lowTotal + VALUES[index],
    hasAce: hasAce || index === 0,
  };
}

function deckAfterHand(hand) {
  const deck = cloneDeck(INITIAL_DECK);
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0 || deck[index] <= 0) throw new Error(`Illegal hand: ${hand.join(',')}`);
    deck[index] -= 1;
  }
  return deck;
}

function handState(hand) {
  let lowTotal = 0;
  let hasAce = false;
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0) throw new Error(`Unknown rank: ${rank}`);
    lowTotal += VALUES[index];
    hasAce ||= index === 0;
  }
  return { lowTotal, hasAce };
}

class L1BudgetExceeded extends Error {
  constructor(reason, elapsedMs, solveCalls) {
    super(`L1 budget exceeded: ${reason}`);
    this.name = 'L1BudgetExceeded';
    this.reason = reason;
    this.elapsedMs = elapsedMs;
    this.solveCalls = solveCalls;
  }
}

class L1Solver {
  constructor() {
    this.memo = new Map();
    this.solveCalls = 0;
    this.cacheHits = 0;
    this.budget = null;
    this.globalLimit = null;
  }

  startGlobalLimit(maxMemoStates, maxMs = Number.POSITIVE_INFINITY, maxSolveCalls = Number.POSITIVE_INFINITY) {
    this.globalLimit = { maxMemoStates, maxMs, maxSolveCalls, startedAt: performance.now(), baseCalls: this.solveCalls };
  }

  clearGlobalLimit() {
    this.globalLimit = null;
  }

  checkGlobalLimit() {
    if (!this.globalLimit) return;
    const elapsedMs = performance.now() - this.globalLimit.startedAt;
    if (this.memo.size >= this.globalLimit.maxMemoStates) {
      throw new L1BudgetExceeded(`memo states>=${this.globalLimit.maxMemoStates}`, elapsedMs, this.solveCalls);
    }
    if (elapsedMs > this.globalLimit.maxMs) {
      throw new L1BudgetExceeded(`global elapsed>${this.globalLimit.maxMs}ms`, elapsedMs, this.solveCalls);
    }
    if (this.solveCalls - this.globalLimit.baseCalls > this.globalLimit.maxSolveCalls) {
      throw new L1BudgetExceeded(`global solve calls>${this.globalLimit.maxSolveCalls}`, elapsedMs, this.solveCalls - this.globalLimit.baseCalls);
    }
  }

  startBudget(maxMs = Number.POSITIVE_INFINITY, maxNewCalls = Number.POSITIVE_INFINITY) {
    this.budget = {
      startedAt: performance.now(),
      baseCalls: this.solveCalls,
      maxMs,
      maxNewCalls,
    };
  }

  clearBudget() {
    this.budget = null;
  }

  checkBudget() {
    if (!this.budget) return;
    const elapsedMs = performance.now() - this.budget.startedAt;
    const newCalls = this.solveCalls - this.budget.baseCalls;
    if (elapsedMs > this.budget.maxMs) {
      throw new L1BudgetExceeded(`elapsed>${this.budget.maxMs}ms`, elapsedMs, newCalls);
    }
    if (newCalls > this.budget.maxNewCalls) {
      throw new L1BudgetExceeded(`solve calls>${this.budget.maxNewCalls}`, elapsedMs, newCalls);
    }
  }

  solve(counts, lowTotal, hasAce) {
    this.solveCalls += 1;
    this.checkGlobalLimit();
    this.checkBudget();
    const key = stateKey(counts, lowTotal, hasAce);
    const memoized = this.memo.get(key);
    if (memoized) {
      this.cacheHits += 1;
      return memoized;
    }

    const currentScore = scoreState(lowTotal, hasAce);
    const stopDistance = distance(currentScore);
    if (currentScore === 21 || currentScore >= 22) {
      const terminal = {
        value: stopDistance,
        action: 'STOP',
        stopDistance,
        drawExpectedDistance: stopDistance,
      };
      this.memo.set(key, terminal);
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
      this.memo.set(key, empty);
      return empty;
    }

    let drawExpectedDistance = 0;
    for (let index = 0; index < counts.length; index += 1) {
      const count = counts[index];
      if (count === 0) continue;
      counts[index] -= 1;
      const child = this.solve(counts, lowTotal + VALUES[index], hasAce || index === 0);
      counts[index] += 1;
      drawExpectedDistance += (count / remaining) * child.value;
    }

    const action = drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP';
    const result = {
      value: Math.min(stopDistance, drawExpectedDistance),
      action,
      stopDistance,
      drawExpectedDistance,
    };
    this.memo.set(key, result);
    return result;
  }
}

function recommendationForState(solver, counts, lowTotal, hasAce, syncState = 'SYNCED') {
  const remaining = deckTotal(counts);
  const currentScore = scoreState(lowTotal, hasAce);
  if (syncState !== 'SYNCED') {
    return { action: 'NONE', basis: 'WITHIN_ROUND', reason: 'NOT_SYNCED', currentScore, remaining };
  }
  if (remaining === 0) {
    return { action: 'NONE', basis: 'WITHIN_ROUND', reason: 'EMPTY_DECK', currentScore, remaining };
  }
  if (currentScore === 0) {
    return { action: 'DRAW', basis: 'WITHIN_ROUND', reason: 'CLOSER_TO_21', currentScore, remaining };
  }
  if (currentScore === 21) {
    return { action: 'STOP', basis: 'WITHIN_ROUND', reason: 'AT_21', currentScore, remaining };
  }
  if (currentScore >= 22) {
    return { action: 'STOP', basis: 'WITHIN_ROUND', reason: 'BURST', currentScore, remaining };
  }
  const solution = solver.solve(counts, lowTotal, hasAce);
  return {
    action: solution.action,
    basis: 'WITHIN_ROUND',
    reason: solution.action === 'DRAW' ? 'CLOSER_TO_21' : 'BURST_RISK',
    currentScore,
    remaining,
    withinRound: {
      stopDistance: solution.stopDistance,
      drawExpectedDistance: solution.drawExpectedDistance,
    },
  };
}

function l1ActionForState(solver, counts, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  if (currentScore === 0) return 'DRAW';
  if (currentScore === 21 || currentScore >= 22) return 'STOP';
  if (deckTotal(counts) === 0) return 'STOP';
  return solver.solve(counts, lowTotal, hasAce).action;
}

function bruteSolve(counts, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  const stopDistance = distance(currentScore);
  if (currentScore === 21 || currentScore >= 22 || deckTotal(counts) === 0) {
    return {
      value: stopDistance,
      action: 'STOP',
      stopDistance,
      drawExpectedDistance: deckTotal(counts) === 0 ? Number.POSITIVE_INFINITY : stopDistance,
    };
  }
  const remaining = deckTotal(counts);
  let drawExpectedDistance = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count === 0) continue;
    counts[index] -= 1;
    const child = bruteSolve(counts, lowTotal + VALUES[index], hasAce || index === 0);
    counts[index] += 1;
    drawExpectedDistance += (count / remaining) * child.value;
  }
  const action = drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP';
  return {
    value: Math.min(stopDistance, drawExpectedDistance),
    action,
    stopDistance,
    drawExpectedDistance,
  };
}

function makeRandomLegalSmallState(rng) {
  const hand = [];
  const available = cloneDeck(INITIAL_DECK);
  const handLength = 1 + rng.nextInt(5);
  for (let draw = 0; draw < handLength; draw += 1) {
    const index = weightedRankIndex(available, rng);
    if (index < 0) break;
    available[index] -= 1;
    hand.push(RANKS[index]);
  }

  // Consume arbitrary previous-round cards so that the current hand and remaining
  // pool are still legal but the brute-force test stays at <=12 remaining cards.
  let remainingTarget = 1 + rng.nextInt(12);
  const counts = new Array(RANKS.length).fill(0);
  while (remainingTarget > 0 && deckTotal(available) > 0) {
    const index = weightedRankIndex(available, rng);
    if (index < 0) break;
    const take = Math.min(available[index], remainingTarget);
    counts[index] += take;
    available[index] -= take;
    remainingTarget -= take;
  }
  return { hand, counts, ...handState(hand) };
}

function makePerformanceState(rng, mode) {
  if (mode === 'fresh-empty') {
    return { hand: [], counts: cloneDeck(INITIAL_DECK), lowTotal: 0, hasAce: false };
  }
  if (mode === 'low-score') {
    const choices = [['2'], ['3'], ['4'], ['A']];
    const hand = choices[rng.nextInt(choices.length)];
    return { hand, counts: deckAfterHand(hand), ...handState(hand) };
  }
  if (mode === 'small-heavy') {
    // A valid cross-round state: prior rounds consumed all 10-point stones;
    // the active hand consumes one 2 so the state remains legal.
    const hand = ['2'];
    const counts = [4, 3, 4, 4, 4, 4, 4, 4, 4, 0];
    return { hand, counts, ...handState(hand) };
  }
  const hand = [];
  const available = cloneDeck(INITIAL_DECK);
  const handLength = 1 + rng.nextInt(4);
  for (let draw = 0; draw < handLength; draw += 1) {
    const index = weightedRankIndex(available, rng);
    if (index < 0) break;
    available[index] -= 1;
    hand.push(RANKS[index]);
  }
  let handStateValue = handState(hand);
  let guard = 0;
  while ((handStateValue.lowTotal >= 21 || handStateValue.lowTotal === 0) && guard < 20) {
    hand.length = 0;
    available.splice(0, available.length, ...INITIAL_DECK);
    const index = 1 + rng.nextInt(8);
    available[index] -= 1;
    hand.push(RANKS[index]);
    handStateValue = handState(hand);
    guard += 1;
  }
  // Keep the thousands-case sample legal while bounding each sampled local
  // state. Full-deck and low-score stress cases are measured separately above.
  const targetRemaining = 1 + rng.nextInt(4);
  while (deckTotal(available) > targetRemaining) {
    const index = weightedRankIndex(available, rng);
    if (index < 0) break;
    available[index] -= 1;
  }
  return { hand, counts: available, ...handStateValue };
}

function benchmarkL1Cases() {
  const cases = [];
  const fixedRng = rngFor('performance-random-states');
  cases.push(makePerformanceState(fixedRng, 'fresh-empty'));
  cases.push(makePerformanceState(fixedRng, 'low-score'));
  cases.push(makePerformanceState(fixedRng, 'small-heavy'));
  const labels = ['fresh-empty', 'low-score', 'small-heavy', 'random-legal'];
  for (const label of labels) {
    const count = label === 'random-legal'
      ? CONFIG.performanceRandomStates
      : label === 'small-heavy'
        ? CONFIG.performanceSmallHeavyStates
        : label === 'low-score'
          ? CONFIG.performanceLowScoreStates
          : 0;
    for (let index = 0; index < count; index += 1) {
      cases.push({
        ...makePerformanceState(fixedRng, label === 'random-legal' ? 'random-legal' : label),
        benchmarkLabel: label,
      });
    }
  }

  const records = [];
  let reusableSolver = null;
  for (const testCase of cases) {
    const isFreshCase = (testCase.benchmarkLabel || (testCase.hand.length === 0 ? 'fresh-empty' : 'fixed-case')) === 'fresh-empty';
    const solver = isFreshCase ? new L1Solver() : (reusableSolver || (reusableSolver = new L1Solver()));
    if (!isFreshCase) {
      solver.memo.clear();
      solver.solveCalls = 0;
      solver.cacheHits = 0;
    }
    const benchmarkMemoLimit = testCase.benchmarkLabel ? 5000 : 20000;
    solver.startGlobalLimit(benchmarkMemoLimit, 500, isFreshCase ? Number.POSITIVE_INFINITY : 10000);
    const started = performance.now();
    let result = null;
    let aborted = null;
    try {
      result = solver.solve(cloneDeck(testCase.counts), testCase.lowTotal, testCase.hasAce);
    } catch (error) {
      if (!(error instanceof L1BudgetExceeded)) throw error;
      aborted = {
        reason: error.message,
        elapsedMs: error.elapsedMs,
        solveCalls: error.solveCalls,
      };
    } finally {
      solver.clearGlobalLimit();
    }
    const elapsedMs = performance.now() - started;
    records.push({
      label: testCase.benchmarkLabel || (testCase.hand.length === 0 ? 'fresh-empty' : 'fixed-case'),
      hand: testCase.hand,
      remaining: deckTotal(testCase.counts),
      score: scoreState(testCase.lowTotal, testCase.hasAce),
      elapsedMs,
      memoStates: solver.memo.size,
      action: result?.action || 'ABORTED',
      aborted,
      result,
      solver: (testCase.benchmarkLabel || (testCase.hand.length === 0 ? 'fresh-empty' : 'fixed-case')) === 'fresh-empty' ? solver : null,
    });
    if (records.length % 100 === 0) console.log(`  L1 performance cases=${records.length}/${cases.length}`);
  }

  if (global.gc) global.gc();
  const all = records;
  const grouped = new Map();
  for (const record of records) {
    if (!grouped.has(record.label)) grouped.set(record.label, []);
    grouped.get(record.label).push(record);
  }
  const summaries = [...grouped.entries()].map(([label, group]) => ({
    label,
    samples: group.length,
    aborted: group.filter((item) => item.aborted).length,
    elapsedMs: {
      p50: percentile(group.map((item) => item.elapsedMs), 0.5),
      p95: percentile(group.map((item) => item.elapsedMs), 0.95),
      max: Math.max(...group.map((item) => item.elapsedMs)),
    },
    memoStates: {
      p50: percentile(group.map((item) => item.memoStates), 0.5),
      p95: percentile(group.map((item) => item.memoStates), 0.95),
      max: Math.max(...group.map((item) => item.memoStates)),
    },
  }));
  const overall = {
    samples: all.length,
    aborted: all.filter((item) => item.aborted).length,
    elapsedMs: {
      p50: percentile(all.map((item) => item.elapsedMs), 0.5),
      p95: percentile(all.map((item) => item.elapsedMs), 0.95),
      max: Math.max(...all.map((item) => item.elapsedMs)),
    },
    memoStates: {
      p50: percentile(all.map((item) => item.memoStates), 0.5),
      p95: percentile(all.map((item) => item.memoStates), 0.95),
      max: Math.max(...all.map((item) => item.memoStates), 0),
    },
  };
  const completed = all.filter((item) => !item.aborted);
  overall.completed = {
    samples: completed.length,
    elapsedMs: {
      p50: percentile(completed.map((item) => item.elapsedMs), 0.5),
      p95: percentile(completed.map((item) => item.elapsedMs), 0.95),
      max: completed.length ? Math.max(...completed.map((item) => item.elapsedMs)) : Number.NaN,
    },
    memoStates: {
      p50: percentile(completed.map((item) => item.memoStates), 0.5),
      p95: percentile(completed.map((item) => item.memoStates), 0.95),
      max: completed.length ? Math.max(...completed.map((item) => item.memoStates)) : Number.NaN,
    },
  };
  const fresh = records.find((item) => item.label === 'fresh-empty');
  return { records, summaries, overall, freshSolver: fresh.solver, fresh };
}

function exactNextDraw(hand, counts) {
  const currentScore = score(hand);
  const remaining = deckTotal(counts);
  const rankOutcomes = RANKS.map((rank, index) => {
    const nextScore = score([...hand, rank]);
    return {
      rank,
      count: counts[index],
      probability: counts[index] / remaining,
      nextScore,
      tier: classify(nextScore),
    };
  });
  const tierCounts = Object.fromEntries(TIER_NAMES.map((tier) => [tier, 0]));
  for (const outcome of rankOutcomes) tierCounts[outcome.tier] += outcome.count;
  return {
    currentScore,
    remaining,
    rankOutcomes,
    tierCounts,
  };
}

function simulateRoundWithL1(counts, initialLowTotal, initialHasAce, solver, rng, onDecision = null) {
  let lowTotal = initialLowTotal;
  let hasAce = initialHasAce;
  while (true) {
    const currentScore = scoreState(lowTotal, hasAce);
    const remaining = deckTotal(counts);
    const action = l1ActionForState(solver, counts, lowTotal, hasAce);
    if (onDecision && currentScore > 0 && currentScore < 21 && remaining > 0) {
      onDecision({ counts: cloneDeck(counts), lowTotal, hasAce, currentScore, remaining, action });
    }
    if (action !== 'DRAW' || remaining === 0) {
      return { distance: distance(currentScore), score: currentScore, lowTotal, hasAce };
    }
    const drawn = drawOne(counts, lowTotal, hasAce, rng);
    if (!drawn) return { distance: distance(currentScore), score: currentScore, lowTotal, hasAce };
    lowTotal = drawn.lowTotal;
    hasAce = drawn.hasAce;
  }
}

function simulateCycleL1({ solver, rng, startCounts = INITIAL_DECK, startLowTotal = 0, startHasAce = false, firstAction = null, onDecision = null }) {
  const counts = cloneDeck(startCounts);
  let lowTotal = startLowTotal;
  let hasAce = startHasAce;
  let forcedAction = firstAction;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    if (forcedAction === 'DRAW') {
      const drawn = drawOne(counts, lowTotal, hasAce, rng);
      forcedAction = null;
      if (drawn) {
        lowTotal = drawn.lowTotal;
        hasAce = drawn.hasAce;
      }
    }

    let round;
    if (forcedAction === 'STOP') {
      round = { distance: distance(scoreState(lowTotal, hasAce)), score: scoreState(lowTotal, hasAce) };
      forcedAction = null;
    } else {
      round = simulateRoundWithL1(counts, lowTotal, hasAce, solver, rng, onDecision);
    }
    roundDistances.push(round.distance);
    roundScores.push(round.score);

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
    cost: sum(roundDistances),
    remainingAtEnd: deckTotal(counts),
  };
}

function simulateCycleWithPolicy({ solver, rng, chooseAction, startCounts = INITIAL_DECK, startLowTotal = 0, startHasAce = false }) {
  const counts = cloneDeck(startCounts);
  let lowTotal = startLowTotal;
  let hasAce = startHasAce;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    while (true) {
      const currentScore = scoreState(lowTotal, hasAce);
      const remaining = deckTotal(counts);
      const action = chooseAction({ solver, counts, lowTotal, hasAce, currentScore, remaining });
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

function evaluateL2(state, solver, lambda, rollouts, seedLabel = 'default', options = {}) {
  const key = stateKey(state.counts, state.lowTotal, state.hasAce);
  const seedValue = hash32(`${key}|${seedLabel}`);
  const seed = `0x${seedValue.toString(16).padStart(8, '0')}`;
  const differences = [];
  const drawCosts = [];
  const stopCosts = [];
  const maxMsPerRollout = options.maxMsPerRollout ?? Number.POSITIVE_INFINITY;
  const maxNewSolveCallsPerRollout = options.maxNewSolveCallsPerRollout ?? Number.POSITIVE_INFINITY;

  for (let index = 0; index < rollouts; index += 1) {
    const drawRng = new SeededRng(hash32(`${seedValue}|${index}|DRAW`));
    const stopRng = new SeededRng(hash32(`${seedValue}|${index}|STOP`));
    let drawResult;
    let stopResult;
    try {
      solver.startBudget(maxMsPerRollout, maxNewSolveCallsPerRollout);
      drawResult = simulateCycleL1({
        solver,
        rng: drawRng,
        startCounts: state.counts,
        startLowTotal: state.lowTotal,
        startHasAce: state.hasAce,
        firstAction: 'DRAW',
      });
      solver.clearBudget();
      solver.startBudget(maxMsPerRollout, maxNewSolveCallsPerRollout);
      stopResult = simulateCycleL1({
        solver,
        rng: stopRng,
        startCounts: state.counts,
        startLowTotal: state.lowTotal,
        startHasAce: state.hasAce,
        firstAction: 'STOP',
      });
      solver.clearBudget();
    } catch (error) {
      solver.clearBudget();
      if (error instanceof L1BudgetExceeded) {
        return {
          key,
          seed,
          seedValue,
          rollouts,
          completedRollouts: index,
          aborted: true,
          abortReason: error.message,
          abortElapsedMs: error.elapsedMs,
          abortSolveCalls: error.solveCalls,
          drawMinusStop: Number.NaN,
          ci95: [Number.NaN, Number.NaN],
          ciWidth: Number.NaN,
          l2Action: null,
          drawCostMean: Number.NaN,
          stopCostMean: Number.NaN,
        };
      }
      throw error;
    }
    drawCosts.push(drawResult.totalDistance - lambda * drawResult.roundCount);
    stopCosts.push(stopResult.totalDistance - lambda * stopResult.roundCount);
    differences.push(drawCosts[index] - stopCosts[index]);
  }

  const difference = mean(differences);
  const interval = ci95(differences);
  const l2Action = difference < 0 ? 'DRAW' : 'STOP';
  return {
    key,
    seed,
    seedValue,
    rollouts,
    completedRollouts: rollouts,
    aborted: false,
    drawMinusStop: difference,
    ci95: interval,
    ciWidth: ciWidth(interval),
    l2Action,
    drawCostMean: mean(drawCosts),
    stopCostMean: mean(stopCosts),
  };
}

function isCiExcludingZero(interval) {
  return interval[0] > 0 || interval[1] < 0;
}

function hybridActionForState({ solver, counts, lowTotal, hasAce, currentScore, remaining }, lambda, rollouts, l2Cache) {
  const l1Action = l1ActionForState(solver, counts, lowTotal, hasAce);
  // PROTOTYPE safety gate: unrestricted L2 was separately probed and can exceed
  // a reasonable synchronous budget on early-cycle states. The comparison below
  // measures the bounded, near-reset variant only; it does not claim full FR-13.
  if (currentScore === 0 || currentScore === 21 || currentScore >= 22 || remaining === 0 || remaining >= RESET_THRESHOLD) return l1Action;
  const key = stateKey(counts, lowTotal, hasAce);
  let l2 = l2Cache.get(key);
  if (!l2) {
    l2 = evaluateL2({ counts: cloneDeck(counts), lowTotal, hasAce }, solver, lambda, rollouts);
    l2Cache.set(key, l2);
  }
  if (!l2.aborted && l2.l2Action !== l1Action && isCiExcludingZero(l2.ci95)) return l2.l2Action;
  return l1Action;
}

function collectDecisionPoints(solver, targetCount, options = {}) {
  const points = [];
  let cycleIndex = 0;
  const boundaryOnly = options.boundaryOnly ?? false;
  while (points.length < targetCount) {
    const rng = rngFor(`decision-points-cycle-${cycleIndex}`);
    simulateCycleL1({
      solver,
      rng,
      onDecision: (state) => {
        if ((!boundaryOnly || state.remaining < RESET_THRESHOLD) && points.length < targetCount) points.push(state);
      },
    });
    if (cycleIndex % 1 === 0) console.log(`  collected cycle ${cycleIndex + 1}, points=${points.length}, memo=${solver.memo.size}`);
    cycleIndex += 1;
  }
  return { points, cycles: cycleIndex, boundaryOnly };
}

function runL2DecisionStudy(solver, lambda, points) {
  const unique = new Map();
  for (const point of points) {
    const key = stateKey(point.counts, point.lowTotal, point.hasAce);
    if (!unique.has(key)) unique.set(key, point);
  }
  const evaluated = new Map();
  const started = performance.now();
  for (const [key, point] of unique) {
    evaluated.set(key, evaluateL2(point, solver, lambda, CONFIG.l2BulkRollouts));
  }
  const elapsedMs = performance.now() - started;
  const rows = points.map((point) => {
    const key = stateKey(point.counts, point.lowTotal, point.hasAce);
    const l2 = evaluated.get(key);
    const l1Action = point.action;
    const opposed = l2.l2Action !== l1Action;
    const significant = isCiExcludingZero(l2.ci95);
    const adopted = opposed && significant;
    return { point, l1Action, l2, opposed, significant, adopted };
  });
  const adoptedRows = rows.filter((row) => row.adopted);
  const opposedRows = rows.filter((row) => row.opposed);
  const bucket = (remaining) => remaining < 15 ? '<15' : remaining < 20 ? '15–19' : remaining < 30 ? '20–29' : '≥30';
  const scoreBand = (currentScore) => currentScore <= 8 ? '1–8' : currentScore <= 12 ? '9–12' : currentScore <= 15 ? '13–15' : currentScore <= 18 ? '16–18' : '19–20';
  const featureCounts = (sourceRows) => {
    const remainingBuckets = Object.fromEntries(['<15', '15–19', '20–29', '≥30'].map((key) => [key, 0]));
    const scoreBands = Object.fromEntries(['1–8', '9–12', '13–15', '16–18', '19–20'].map((key) => [key, 0]));
    for (const row of sourceRows) {
      remainingBuckets[bucket(row.point.remaining)] += 1;
      scoreBands[scoreBand(row.point.currentScore)] += 1;
    }
    return { remainingBuckets, scoreBands };
  };
  return {
    rows,
    uniqueStates: unique.size,
    evaluatedStates: evaluated.size,
    elapsedMs,
    rollouts: CONFIG.l2BulkRollouts,
    opposedCount: opposedRows.length,
    significantCount: rows.filter((row) => row.significant).length,
    adoptedCount: adoptedRows.length,
    opposedRate: opposedRows.length / rows.length,
    adoptedRate: adoptedRows.length / rows.length,
    featuresOpposed: featureCounts(opposedRows),
    featuresAdopted: featureCounts(adoptedRows),
    ciWidths: rows.map((row) => row.l2.ciWidth),
    sampleRows: rows.slice(0, 5),
  };
}

function runFullRolloutStudy(solver, lambda, points) {
  const sample = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / CONFIG.l2FullSampleStates)) === 0)
    .slice(0, CONFIG.l2FullSampleStates);
  const rows = [];
  for (const point of sample) {
    const started = performance.now();
    const result = evaluateL2(point, solver, lambda, CONFIG.l2FullRollouts, '2000-rollout');
    rows.push({ result, elapsedMs: performance.now() - started, point });
  }
  return {
    requestedStates: CONFIG.l2FullSampleStates,
    states: rows.length,
    rollouts: CONFIG.l2FullRollouts,
    rows,
    elapsedMs: sum(rows.map((row) => row.elapsedMs)),
    timing: {
      p50: percentile(rows.map((row) => row.elapsedMs), 0.5),
      p95: percentile(rows.map((row) => row.elapsedMs), 0.95),
      max: Math.max(...rows.map((row) => row.elapsedMs)),
    },
    ciWidths: {
      p50: percentile(rows.map((row) => row.result.ciWidth), 0.5),
      p95: percentile(rows.map((row) => row.result.ciWidth), 0.95),
      max: Math.max(...rows.map((row) => row.result.ciWidth)),
    },
  };
}

function runSeedSensitivity(solver, lambda, points) {
  const sample = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / CONFIG.seedSensitivityStates)) === 0)
    .slice(0, CONFIG.seedSensitivityStates);
  const rows = sample.map((point) => {
    const l1Action = point.action;
    const conclusions = ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5'].map((label) => {
      const result = evaluateL2(point, solver, lambda, CONFIG.l2BulkRollouts, label);
      return result.l2Action;
    });
    const majority = conclusions.filter((action) => action === conclusions[0]).length;
    const flipsFromFirst = conclusions.slice(1).filter((action) => action !== conclusions[0]).length;
    const flipsFromL1 = conclusions.filter((action) => action !== l1Action).length;
    return { point, l1Action, conclusions, flipsFromFirst, flipsFromL1, majority };
  });
  const totalConclusions = rows.length * 5;
  const firstConclusionFlips = sum(rows.map((row) => row.flipsFromFirst));
  const anyFlipRows = rows.filter((row) => row.flipsFromFirst > 0).length;
  return {
    states: rows.length,
    rolloutsPerOption: CONFIG.l2BulkRollouts,
    rows,
    conclusionCount: totalConclusions,
    flipsAgainstFirst: firstConclusionFlips,
    flipRateAgainstFirst: totalConclusions === 0 ? 0 : firstConclusionFlips / (rows.length * 4),
    statesWithAnyFlip: anyFlipRows,
    stateAnyFlipRate: rows.length === 0 ? 0 : anyFlipRows / rows.length,
  };
}

function runUnrestrictedL2Probe(solver, lambda) {
  const hand = ['10', '10'];
  const stateValues = handState(hand);
  const state = { counts: deckAfterHand(hand), ...stateValues, currentScore: score(hand), remaining: deckTotal(deckAfterHand(hand)) };
  const started = performance.now();
  const probeSolver = new L1Solver();
  const result = evaluateL2(state, probeSolver, lambda, 1, 'unrestricted-probe', {
    maxMsPerRollout: 500,
    maxNewSolveCallsPerRollout: 20000,
  });
  return {
    state,
    elapsedMs: performance.now() - started,
    result,
    budgetMs: 500,
    budgetSolveCalls: 20000,
  };
}

function runBaseline(solver) {
  const distances = [];
  const cycleAverages = [];
  const roundsPerCycle = [];
  const boundaryPoints = [];
  let aborted = null;
  let cyclesCompleted = 0;
  for (let cycle = 0; cycle < CONFIG.baselineCycles; cycle += 1) {
    try {
      const result = simulateCycleL1({
        solver,
        rng: rngFor(`fresh-baseline-${cycle}`),
        onDecision: (state) => {
          if (state.remaining < RESET_THRESHOLD && boundaryPoints.length < CONFIG.decisionPoints) boundaryPoints.push(state);
        },
      });
      distances.push(...result.roundDistances);
      cycleAverages.push(result.averageDistance);
      roundsPerCycle.push(result.roundCount);
      cyclesCompleted += 1;
    } catch (error) {
      if (!(error instanceof L1BudgetExceeded)) throw error;
      aborted = {
        reason: error.message,
        elapsedMs: error.elapsedMs,
        solveCalls: error.solveCalls,
        memoStates: solver.memo.size,
      };
      break;
    }
  }
  return {
    requestedCycles: CONFIG.baselineCycles,
    cycles: cyclesCompleted,
    complete: !aborted && cyclesCompleted === CONFIG.baselineCycles,
    aborted,
    boundaryPoints,
    distances,
    lambda: mean(distances),
    distanceCi95: ci95(distances),
    cycleAverageDistance: mean(cycleAverages),
    cycleAverageDistanceCi95: ci95(cycleAverages),
    averageRounds: mean(roundsPerCycle),
    roundsCi95: ci95(roundsPerCycle),
    totalRounds: distances.length,
  };
}

function runPolicyComparison(solver, lambda, requestedCycles = CONFIG.comparisonCycles) {
  const l1CycleAverages = [];
  const hybridCycleAverages = [];
  const l1Distances = [];
  const hybridDistances = [];
  const hybridL2Cache = new Map();
  let aborted = null;
  for (let cycle = 0; cycle < requestedCycles; cycle += 1) {
    try {
      const l1 = simulateCycleL1({ solver, rng: rngFor(`comparison-l1-${cycle}`) });
      const hybrid = simulateCycleWithPolicy({
        solver,
        rng: rngFor(`comparison-hybrid-${cycle}`),
        chooseAction: (state) => hybridActionForState(state, lambda, CONFIG.l2BulkRollouts, hybridL2Cache),
      });
      l1CycleAverages.push(l1.averageDistance);
      hybridCycleAverages.push(hybrid.averageDistance);
      l1Distances.push(...l1.roundDistances);
      hybridDistances.push(...hybrid.roundDistances);
    } catch (error) {
      if (!(error instanceof L1BudgetExceeded)) throw error;
      aborted = { reason: error.message, elapsedMs: error.elapsedMs, solveCalls: error.solveCalls, memoStates: solver.memo.size };
      break;
    }
  }
  const pairedDifferences = hybridCycleAverages.map((value, index) => value - l1CycleAverages[index]);
  const independentMeanDifference = mean(hybridCycleAverages) - mean(l1CycleAverages);
  return {
    requestedCycles,
    cycles: l1CycleAverages.length,
    complete: !aborted && l1CycleAverages.length === requestedCycles,
    aborted,
    l1AverageDistance: mean(l1CycleAverages),
    hybridAverageDistance: mean(hybridCycleAverages),
    l1CycleCi95: ci95(l1CycleAverages),
    hybridCycleCi95: ci95(hybridCycleAverages),
    improvementPerRound: mean(l1Distances) - mean(hybridDistances),
    improvementPerRoundCi95: pairedDifferences.length === 0
      ? [Number.NaN, Number.NaN]
      : [-ci95(pairedDifferences)[1], -ci95(pairedDifferences)[0]],
    independentMeanDifference,
    l1Rounds: l1Distances.length,
    hybridRounds: hybridDistances.length,
    l2CacheStates: hybridL2Cache.size,
  };
}

function runCorrectnessChecks() {
  const scoreResults = SCORE_CASES.map((testCase) => ({
    ...testCase,
    actual: score(testCase.hand),
    passed: score(testCase.hand) === testCase.expected,
  }));

  const bruteRng = rngFor('brute-force-correctness');
  let mismatchCount = 0;
  let maxAbsoluteValueError = 0;
  let bruteSampleCount = 0;
  for (let index = 0; index < CONFIG.bruteCases; index += 1) {
    const state = makeRandomLegalSmallState(bruteRng);
    const solver = new L1Solver();
    const memoResult = solver.solve(cloneDeck(state.counts), state.lowTotal, state.hasAce);
    const bruteResult = bruteSolve(cloneDeck(state.counts), state.lowTotal, state.hasAce);
    const valueError = Math.abs(memoResult.value - bruteResult.value);
    maxAbsoluteValueError = Math.max(maxAbsoluteValueError, valueError);
    if (memoResult.action !== bruteResult.action || valueError > 1e-9) mismatchCount += 1;
    bruteSampleCount += 1;
  }

  const standardHand = ['4', '7', '6'];
  const standardDeck = deckAfterHand(standardHand);
  const exact = exactNextDraw(standardHand, standardDeck);
  const standardSolver = new L1Solver();
  const standardState = handState(standardHand);
  const recommendation = recommendationForState(standardSolver, standardDeck, standardState.lowTotal, standardState.hasAce);
  const expectedTierCounts = { PERFECT: 3, GREAT: 8, GOOD: 4, NORMAL: 0, BURST: 34 };
  const tierCountsPassed = JSON.stringify(exact.tierCounts) === JSON.stringify(expectedTierCounts);
  const exactRankDistribution = exact.rankOutcomes.map((outcome) => ({
    rank: outcome.rank,
    count: outcome.count,
    nextScore: outcome.nextScore,
    tier: outcome.tier,
    probability: outcome.probability,
  }));

  return {
    scoreResults,
    scorePassed: scoreResults.every((result) => result.passed),
    bruteSampleCount,
    bruteMismatchCount: mismatchCount,
    bruteMaxAbsoluteValueError: maxAbsoluteValueError,
    exactRankDistribution,
    exactTierCounts: exact.tierCounts,
    tierCountsPassed,
    standardRecommendation: recommendation,
    standardPassed: recommendation.action === 'STOP'
      && recommendation.withinRound.stopDistance === 4
      && recommendation.withinRound.drawExpectedDistance > 4,
  };
}

function runDeterminismCheck(solver, lambda, points) {
  if (points.length === 0) {
    return { l1Equal: false, l2Equal: false, ciWidth: Number.NaN, l1: null, l2: null, point: null };
  }
  const point = points[Math.min(17, points.length - 1)];
  const l1A = recommendationForState(solver, point.counts, point.lowTotal, point.hasAce);
  const l1B = recommendationForState(solver, point.counts, point.lowTotal, point.hasAce);
  const l2A = evaluateL2(point, solver, lambda, CONFIG.l2FullRollouts, 'determinism');
  const l2B = evaluateL2(point, solver, lambda, CONFIG.l2FullRollouts, 'determinism');
  return {
    point,
    l1Equal: JSON.stringify(l1A) === JSON.stringify(l1B),
    l2Equal: JSON.stringify(l2A) === JSON.stringify(l2B),
    l1: l1A,
    l2: l2A,
    ciWidth: l2A.ciWidth,
  };
}

function tableCell(value) {
  return String(value).replaceAll('|', '\\|');
}

function renderPerformanceTable(performanceResult) {
  const rows = performanceResult.summaries.map((summary) => `| ${tableCell(summary.label)} | ${summary.samples} | ${summary.aborted} | ${formatNumber(summary.memoStates.p50, 0)} | ${formatNumber(summary.memoStates.p95, 0)} | ${formatNumber(summary.memoStates.max, 0)} | ${formatNumber(summary.elapsedMs.p50, 3)} | ${formatNumber(summary.elapsedMs.p95, 3)} | ${formatNumber(summary.elapsedMs.max, 3)} |`);
  const overall = performanceResult.overall;
  rows.push(`| **ALL** | **${overall.samples}** | **${overall.aborted}** | **${formatNumber(overall.memoStates.p50, 0)}** | **${formatNumber(overall.memoStates.p95, 0)}** | **${formatNumber(overall.memoStates.max, 0)}** | **${formatNumber(overall.elapsedMs.p50, 3)}** | **${formatNumber(overall.elapsedMs.p95, 3)}** | **${formatNumber(overall.elapsedMs.max, 3)}** |`);
  return [
    '| 類別 | 樣本數 | 中止數 | memo p50 | memo p95 | memo max | 耗時 p50 (ms) | 耗時 p95 (ms) | 耗時 max (ms) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

function renderTierDistribution(correctness) {
  return correctness.exactRankDistribution.map((row) => `| ${row.rank} | ${row.count} | ${row.nextScore} | ${row.tier} | ${(row.probability * 100).toFixed(10)}% |`).join('\n');
}

function renderFeatureCounts(features) {
  const remaining = Object.entries(features.remainingBuckets).map(([key, value]) => `${key}: ${value}`).join('、');
  const scores = Object.entries(features.scoreBands).map(([key, value]) => `${key}: ${value}`).join('、');
  return `剩餘牌池（${remaining}）；分數（${scores}）`;
}

function renderSeedRows(seedStudy) {
  return seedStudy.rows.slice(0, 8).map((row, index) => `| ${index + 1} | ${row.point.currentScore} | ${row.point.remaining} | ${row.l1Action} | ${row.conclusions.join(' / ')} |`).join('\n');
}

function performancePayload(result) {
  return {
    summaries: result.summaries,
    overall: result.overall,
    fresh: {
      memoStates: result.fresh.memoStates,
      elapsedMs: result.fresh.elapsedMs,
      action: result.fresh.action,
      aborted: result.fresh.aborted,
    },
  };
}

function emptyPerformanceResult(errorMessage) {
  return {
    summaries: [],
    overall: {
      samples: 0,
      aborted: 1,
      elapsedMs: { p50: Number.NaN, p95: Number.NaN, max: Number.NaN },
      memoStates: { p50: Number.NaN, p95: Number.NaN, max: Number.NaN },
    },
    fresh: { memoStates: Number.NaN, elapsedMs: Number.NaN, action: 'ABORTED', aborted: { reason: errorMessage } },
    childError: errorMessage,
  };
}

function runPerformanceIsolated() {
  try {
    unlinkSync(PERFORMANCE_RESULT_PATH);
  } catch {
    // No previous child result is expected on the first run.
  }
  const child = spawnSync(
    process.execPath,
    ['--expose-gc', fileURLToPath(import.meta.url), '--performance-child'],
    { cwd: PROTOTYPE_DIR, encoding: 'utf8', timeout: 240000, windowsHide: true },
  );
  if (child.error) return emptyPerformanceResult(`performance child error: ${child.error.message}`);
  if (child.status !== 0) return emptyPerformanceResult(`performance child exit=${child.status}; stderr=${child.stderr.trim()}`);
  try {
    return JSON.parse(readFileSync(PERFORMANCE_RESULT_PATH, 'utf8'));
  } catch (error) {
    return emptyPerformanceResult(`performance result missing or invalid: ${error.message}`);
  }
}

function performanceChildMain() {
  const result = benchmarkL1Cases();
  writeFileSync(PERFORMANCE_RESULT_PATH, JSON.stringify(performancePayload(result)), 'utf8');
  console.log(`performance child complete: ${result.overall.samples} samples, ${result.overall.aborted} aborted`);
}

function buildReport({ performanceResult, correctness, baseline, unrestrictedProbe, l2Study, fullRollout, seedStudy, comparison, determinism, totalElapsedMs }) {
  const nodeVersion = process.version;
  const cpuModel = cpus()[0]?.model || '無法取得';
  const cpuCount = cpus().length || '未知';
  const p95Desktop = performanceResult.overall.elapsedMs.p95;
  const p95CompletedDesktop = performanceResult.overall.completed?.elapsedMs.p95 ?? Number.NaN;
  const p95MobileEstimate = p95Desktop * 4;
  const p95CompletedMobileEstimate = p95CompletedDesktop * 4;
  const l1TargetPass = performanceResult.overall.aborted === 0 && p95CompletedMobileEstimate < 50;
  const l2TargetPass = fullRollout.timing.p95 < 1000;
  const scoreCaseSummary = `${correctness.scorePassed ? '通過' : '失敗'}（${correctness.scoreResults.filter((item) => item.passed).length}/${correctness.scoreResults.length}）`;
  const standard = correctness.standardRecommendation;
  const rangePass = standard.withinRound.drawExpectedDistance >= 15.27 && standard.withinRound.drawExpectedDistance <= 15.76;
  const adoptedRate = l2Study.adoptedRate * 100;
  const improvement = comparison.improvementPerRound;
  const baselineComplete = baseline.complete;
  const fullDecisionStudyComplete = baselineComplete && l2Study.rows.length >= CONFIG.decisionPoints;
  const unrestrictedProbeStatus = unrestrictedProbe.result.aborted
    ? `中止（${unrestrictedProbe.result.abortReason}；elapsed ${formatNumber(unrestrictedProbe.elapsedMs, 3)} ms）`
    : `完成（${formatNumber(unrestrictedProbe.elapsedMs, 3)} ms）`;
  const retainL2 = fullDecisionStudyComplete && l2Study.adoptedCount > 0 && improvement > 0;
  const comparisonSummary = comparison.cycles === 0
    ? `未執行完整週期比較（${comparison.aborted?.reason || '無可用樣本'}）；因此沒有可報告的 L1+L2 平均改善或 CI。`
    : `以獨立完整週期比較（每策略實際 ${comparison.cycles}/${comparison.requestedCycles} 個週期${comparison.complete ? '，已完成' : '，未完成'}；L1 與 L1+L2 使用不同 seed，且 L2 僅在剩餘 <15 邊界套用）：純 L1 每局平均距離 ${formatNumber(comparison.l1AverageDistance, 6)}；L1+L2 ${formatNumber(comparison.hybridAverageDistance, 6)}；改善（L1−L1+L2）${formatNumber(comparison.improvementPerRound, 6)}，95% CI [${formatNumber(comparison.improvementPerRoundCi95[0], 6)}, ${formatNumber(comparison.improvementPerRoundCi95[1], 6)}]。${comparison.aborted ? `中止原因：${comparison.aborted.reason}。` : ''}`;
  const l2Recommendation = !fullDecisionStudyComplete
    ? `完整 FR-13 L2 未完成：L1 跨局 memo 狀態先觸發上限，僅完成 ${l2Study.rows.length}/${CONFIG.decisionPoints} 個實際決策點，且樣本限定剩餘 <15 的邊界；目前不能據此宣稱 L2 有價值。保留 L2 作為待驗證原型，產品預設維持 L1。`
    : retainL2
      ? `保留 L2 作為週期修正，但只在 CI 排除 0 時採用；本次 ${l2Study.adoptedCount}/${l2Study.rows.length} 個決策點實際採用，先不把 L2 結果寫入資料模型。`
      : '保留 L2 原型以收集證據，但本次沒有足夠證據證明採用後改善，產品預設應維持 L1；若要上線仍需更大樣本或真實觀察。';
  const rolloutRecommendation = l2Study.rollouts < 2000
    ? `原型批量使用 ${l2Study.rollouts} 次／選項；2000 次只在 ${fullRollout.states} 個狀態做穩定性／CI 量測。若產品要依 FR-13 採用，建議保留 2000 次或以 CI 寬度作動態停止，不能把 ${l2Study.rollouts} 視為已驗證的正式數值。`
    : '本次批量已使用 2000 次／選項，可沿用並持續監看 CI 寬度。';
  const workerRecommendation = `L1 桌機 p95 ${formatNumber(p95Desktop, 3)} ms；×4 手機粗估 ${formatNumber(p95MobileEstimate, 3)} ms。${performanceResult.overall.aborted > 0 ? `有 ${performanceResult.overall.aborted} 個局面中止，雖然完成局面 ×4 粗估為 ${formatNumber(p95CompletedMobileEstimate, 3)} ms，不能宣稱 FR-13 已達標。` : (l1TargetPass ? 'L1 粗估仍低於 50 ms，但這不是 Playwright CPU 4× 實測。' : '×4 粗估超過 50 ms，應把 L1 移至 Worker 或調整驗收目標。')} 邊界樣本的 L2 ${CONFIG.l2FullRollouts} rollout p95 ${formatNumber(fullRollout.timing.p95, 3)} ms；${l2TargetPass ? '該受限樣本低於 1 s，但不能代表未受限完整週期。' : '受限樣本已超過 1 s，必須放 Worker。'} 未受限 score=20、N=50 探測：${unrestrictedProbeStatus}；因此仍建議 L2 必須放 Worker，並先顯示 L1。`;
  const ac14Recommendation = rangePass
    ? `4+7+6 的 drawExpectedDistance ${formatNumber(standard.withinRound.drawExpectedDistance, 9)} 落在目前 15.27～15.76 範圍；AC-14 可保留範圍並新增精確值／容差。`
    : `4+7+6 的 drawExpectedDistance ${formatNumber(standard.withinRound.drawExpectedDistance, 9)} 不在目前 15.27～15.76 範圍；AC-14 應改成以本次獨立實算值（容差 1e-9）及 STOP、stopDistance=4 驗收，不能保留不符的範圍。`;

  return `# 推薦引擎演算法原型驗證報告

> **PROTOTYPE／throwaway**：本報告與程式只用於回答 FR-13 的演算法與效能問題，位於 \\.scratch，不是產品程式、不是產品依賴，也不應把推薦結果寫入 Supabase。

## 執行摘要

- 執行環境：Node.js ${nodeVersion}；CPU：${cpuModel}；邏輯執行緒 ${cpuCount}；Windows ${process.arch}。
- 重現命令：\`node .scratch\\recommender-prototype\\run-all.mjs\`（工作目錄為 repo 根目錄）。
- 本次總執行時間：${formatNumber(totalElapsedMs / 1000, 3)} s；所有數字均由本次執行產生，未硬編結果。
- 規則依據：\`docs/開發規格.md\` FR-03、FR-04、FR-13 與 \`docs/遊戲詳細規則.md\` §2～§6；本原型固定使用 BURST_DISTANCE=22、少於 15 才在下一局前換新 52 張。

## 1. L1 效能（桌機 Node 實測；手機為 ×4 粗估）

L1 使用 exact expectimax、每個測試局面建立獨立 memo；沒有降低牌池規則或把 Monte Carlo 當成 L1。共量測 ${performanceResult.overall.samples} 個合法局面（其中 ${performanceResult.overall.aborted} 個因抽樣局面 0.5 秒／5,000 memo、固定局面 0.5 秒／20,000 memo 上限中止）：固定全新 52 顆／空手牌、低分手牌、刻意移除 10 點牌後的小點數牌池，以及 ${CONFIG.performanceRandomStates} 個隨機合法局面（抽樣牌池剩餘 1～4 顆，以避免把「狀態爆炸」偷偷當成完成）。耗時不含報告輸出；memo 狀態數是該次求解實際建立的狀態數。

${renderPerformanceTable(performanceResult)}

- 全新 52 顆／空手牌固定案例：memo ${performanceResult.fresh.memoStates} states，${formatNumber(performanceResult.fresh.elapsedMs, 3)} ms，動作 ${performanceResult.fresh.action}。
- 全體桌機耗時 p50／p95／max：${formatNumber(performanceResult.overall.elapsedMs.p50, 3)}／${formatNumber(p95Desktop, 3)}／${formatNumber(performanceResult.overall.elapsedMs.max, 3)} ms；僅完成局面 p95：${formatNumber(p95CompletedDesktop, 3)} ms（×4 粗估 ${formatNumber(p95CompletedMobileEstimate, 3)} ms）。全體 p95 ×4 粗估：${formatNumber(p95MobileEstimate, 3)} ms；FR-13 p95 <50 ms 判定：**${performanceResult.overall.aborted === 0 ? (l1TargetPass ? '達標' : '不達標') : '未完成，不能宣稱達標'}**。
- 中止局面仍列入 p95／max；中止代表 exact L1 在原型的合理預算內未完成，不是把結果當成功。若有中止，FR-13 的 p95 粗估不能宣稱通過。
- 限制：×4 是需求指定的粗估，不是 Playwright CPU 4× 或實體手機實測；Node V8 與瀏覽器 Worker 的排程成本未量測。

## 2. L2 價值（實測與限制）

先從全新週期以 L1 策略隨機模擬；本次 L1 跨局 memo 在 ${baseline.complete ? '預定樣本內完成' : `第 ${baseline.cycles} 個週期後因 ${baseline.aborted?.reason || '狀態上限'} 中止`}，所以只收集到 ${l2Study.rows.length} 個實際決策點，且刻意限定為剩餘牌池 <15 的換牌邊界（實際跨 ${collectDecisionPointCycles} 個已完成週期；unique ${l2Study.uniqueStates}）。原本要求的數千個全分布決策點未完成，不能把以下邊界樣本外推成完整 FR-13 結論。未受限 score=20、N=50 的 1 rollout L2 探測：${unrestrictedProbeStatus}。批量 L2 每個選項 ${l2Study.rollouts} 次；完整 2000×每點不是本次可完成的樣本。

- L2 與 L1 結論相反：${l2Study.opposedCount}/${l2Study.rows.length}（${formatNumber(l2Study.opposedRate * 100, 3)}%）。
- 相反且 95% CI 不含 0、因此依採用門檻切換：${l2Study.adoptedCount}/${l2Study.rows.length}（${formatNumber(adoptedRate, 3)}%）。
- 所有 L2 結論（不論是否與 L1 相反）中，CI 不含 0：${l2Study.significantCount}/${l2Study.rows.length}。
- 相反點特徵：${renderFeatureCounts(l2Study.featuresOpposed)}。
- 實際採用點特徵：${renderFeatureCounts(l2Study.featuresAdopted)}。
- 2000 rollout／選項的 CI 寬度 p50／p95／max：${formatNumber(fullRollout.ciWidths.p50, 6)}／${formatNumber(fullRollout.ciWidths.p95, 6)}／${formatNumber(fullRollout.ciWidths.max, 6)}。
- ${comparisonSummary}
- 推論：${l2Recommendation}

## 3. FRESH_DECK_BASELINE

以 ${baseline.requestedCycles} 個目標、實際完成 ${baseline.cycles} 個獨立 seeded 全新 52 顆週期、每局遵循 L1、局末剩餘 <15 即結束週期的完整模擬產生 λ；共觀察 ${baseline.totalRounds} 局。${baseline.complete ? '' : `基線在完成 ${baseline.cycles} 個週期後中止（${baseline.aborted.reason}），因此 λ 只是部分樣本，不是已完成的 FRESH_DECK_BASELINE。`} λ 取已完成局的距離平均（${baseline.totalRounds} 個局級觀測），不是手動指定。

- 基線完成狀態：**${baseline.complete ? '完成' : '未完成／部分樣本'}**；目標 ${baseline.requestedCycles}、完成 ${baseline.cycles}。
- **λ = ${formatNumber(baseline.lambda, 9)}**。
- 每局平均距離：${formatNumber(baseline.lambda, 6)}，95% CI [${formatNumber(baseline.distanceCi95[0], 6)}, ${formatNumber(baseline.distanceCi95[1], 6)}]。
- 以週期內局平均再聚合：${formatNumber(baseline.cycleAverageDistance, 6)}，95% CI [${formatNumber(baseline.cycleAverageDistanceCi95[0], 6)}, ${formatNumber(baseline.cycleAverageDistanceCi95[1], 6)}]。
- 每週期平均局數：${formatNumber(baseline.averageRounds, 6)}，95% CI [${formatNumber(baseline.roundsCi95[0], 6)}, ${formatNumber(baseline.roundsCi95[1], 6)}]。
- λ 的用途是 L2 的週期中心化分數 \`Σ(distance−λ)\`；修改 L1、BURST_DISTANCE 或補牌邊界後必須重算。

## 4. 4、7、6 驗算

從全新牌池抽走 4、7、6，剩 49 顆，使用精確逐點枚舉與 L1：

- 推薦：**${standard.action}**；stopDistance = **${standard.withinRound.stopDistance}**；drawExpectedDistance = **${standard.withinRound.drawExpectedDistance.toFixed(12)}**。
- 目前 FR-13 期待範圍 15.27～15.76：**${rangePass ? '符合' : '不符合'}**。${rangePass ? '範圍涵蓋本次結果，但仍建議寫入精確值與容差。' : '規格範圍與本次規則實算不一致，應修正驗收數字。'}

### 精確下一抽分布

| 下一抽 | 剩餘顆數 | 抽後分數 | 等級 | 機率 |
|---|---:|---:|---|---:|
${renderTierDistribution(correctness)}

級距顆數：${Object.entries(correctness.exactTierCounts).map(([tier, count]) => `${tier}=${count}/49`).join('、')}；與 FR-04／遊戲規則 §6 的 3、8、4、0、34 一致：**${correctness.tierCountsPassed ? '是' : '否'}**。

## 5. 決定性／穩定性

- 同一狀態 L1 重跑完全相同：**${determinism.l1Equal ? '是' : '否'}**。
- 同一狀態 L2（${CONFIG.l2FullRollouts} rollout／選項、相同 seed label）重跑完全相同：**${determinism.l2Equal ? '是' : '否'}**；seed = \`${determinism.l2.seed}\`。
- 2000 rollout 典型 CI 寬度：p50 ${formatNumber(fullRollout.ciWidths.p50, 6)}、p95 ${formatNumber(fullRollout.ciWidths.p95, 6)}、max ${formatNumber(fullRollout.ciWidths.max, 6)}。
- 改換 5 個 seed（每選項 ${seedStudy.rolloutsPerOption} rollout、${seedStudy.states} 個狀態）：相對第一個結論的 seed-to-seed 翻轉 ${seedStudy.flipsAgainstFirst}/${seedStudy.states * 4}（${formatNumber(seedStudy.flipRateAgainstFirst * 100, 3)}%）；${seedStudy.statesWithAnyFlip}/${seedStudy.states} 狀態出現至少一次翻轉（${formatNumber(seedStudy.stateAnyFlipRate * 100, 3)}%）。
- 結論：seeded PRNG 確實讓同一狀態／同一 seed 可重現；換 seed 仍可能改變統計結論，不能把 deterministic 誤稱為無抽樣誤差。

## 正確性檢查

- §3 的 10 個計分案例：**${scoreCaseSummary}**。
- memo L1 對獨立無 memo 暴力枚舉：${correctness.bruteSampleCount} 組合法小牌池（剩餘總數 ≤12），不一致 **${correctness.bruteMismatchCount}**；最大期望距離絕對誤差 ${correctness.bruteMaxAbsoluteValueError}（容差 1e-9）。
- 4+7+6 的推薦、級距顆數與下一抽分布：**${correctness.standardPassed && correctness.tierCountsPassed ? '通過' : '失敗'}**。

## FR-13 具體修改建議（供決定，不直接修改正式規格）

1. **L2 是否保留**：${l2Recommendation}
2. **rollout 數**：${rolloutRecommendation}
3. **效能目標與 Worker**：${workerRecommendation}
4. **λ**：${baseline.complete ? `本次實測 λ=${formatNumber(baseline.lambda, 9)} 可作原型基準，但仍應保存產生腳本、樣本數與版本。` : `本次只取得部分樣本 λ=${formatNumber(baseline.lambda, 9)}，不能寫入正式常數；先修正 L1 跨局狀態爆炸／執行策略，再用完整基線重算。`} 修改 L1、BURST_DISTANCE 或補牌邊界後必須重算。
5. **AC-14**：${ac14Recommendation} 另保留「UNSYNCED／N=0 不給建議」與 1000 組無 memo 對照；不要把 L2 的隨機 CI 結果寫入產品資料模型。
6. **未驗證限制**：${baseline.complete ? '' : 'L1 從新週期跨局模擬在 memo 約 100,000／5 秒預算內未能完成目標樣本，這是本次最重要的阻塞；'}未執行 Playwright CPU 4×、真實手機、Web Worker 排程、真實遊戲跨局補牌觀察、Supabase；本報告的跨局結果是規則模型模擬，不是遊戲事實。

## 重現參數與實測／推論界線

- L1 效能：${performanceResult.overall.samples} 個合法局面；每局面獨立 memo；桌機 Node \`${nodeVersion}\`；中止 ${performanceResult.overall.aborted} 個。
- 無 memo：${correctness.bruteSampleCount} 組，剩餘牌池總數 1～12。
- FRESH_DECK_BASELINE：目標 ${baseline.requestedCycles}、完成 ${baseline.cycles} 週期、${baseline.totalRounds} 局；完成狀態 ${baseline.complete ? '是' : '否'}。
- L2 批量：${l2Study.rows.length} 個實際邊界決策點、unique ${l2Study.uniqueStates}、${CONFIG.l2BulkRollouts} rollout／選項；${CONFIG.l2FullRollouts} rollout 穩定性樣本 ${fullRollout.states} 個狀態；未受限探測 ${unrestrictedProbeStatus}。
- seed sensitivity：${seedStudy.states} 個狀態、5 個 seed、每選項 ${seedStudy.rolloutsPerOption} rollout。
- policy comparison：目標 ${comparison.requestedCycles}、實際 ${comparison.cycles} 個獨立完整週期／策略；${comparison.complete ? '完成' : '未完成或未執行'}。
- **實測**：以上執行時間、memo 數、CI、比例、λ、4+7+6 數字、正確性比對。
- **推論／粗估**：桌機結果乘 4 的手機估算、是否需要 Worker 的產品決策、L2 是否長期有價值；這些不能取代實機與正式整合測試。
`;
}

let collectDecisionPointCycles = 0;

function main() {
  const allStarted = performance.now();
  console.log('[1/9] correctness');
  const correctness = runCorrectnessChecks();
  console.log('[2/9] isolated L1 performance sample');
  const performanceResult = runPerformanceIsolated();
  console.log(`[2/9 performance] samples=${performanceResult.overall.samples}, aborted=${performanceResult.overall.aborted}`);
  console.log('[3/9] prepare shared full-deck L1 memo');
  const solver = new L1Solver();
  solver.solve(cloneDeck(INITIAL_DECK), 0, false);
  solver.startGlobalLimit(100000, 5000, 200000);
  console.log('[3/9] fresh-deck baseline');
  const baseline = runBaseline(solver);
  solver.clearGlobalLimit();
  console.log('[3/9] unrestricted L2 probe');
  const unrestrictedProbe = runUnrestrictedL2Probe(solver, baseline.lambda);
  console.log(`[3/9 probe] ${unrestrictedProbe.result.aborted ? 'aborted' : 'completed'} in ${formatNumber(unrestrictedProbe.elapsedMs, 3)} ms`);
  console.log('[4/9] collect near-reset decision points from baseline');
  const collected = {
    points: baseline.boundaryPoints,
    cycles: baseline.cycles,
    boundaryOnly: true,
    aborted: !baseline.complete,
  };
  collectDecisionPointCycles = collected.cycles;
  console.log(`[5/9] L2 bulk (${collected.points.length} points, ${CONFIG.l2BulkRollouts} rollouts)`);
  const l2Study = runL2DecisionStudy(solver, baseline.lambda, collected.points);
  console.log(`[6/9] L2 ${CONFIG.l2FullRollouts}-rollout sample`);
  const fullRollout = runFullRolloutStudy(solver, baseline.lambda, collected.points);
  console.log('[7/9] seed sensitivity');
  const seedStudy = runSeedSensitivity(solver, baseline.lambda, collected.points);
  console.log('[8/9] independent policy comparison');
  let comparison;
  if (baseline.complete) {
    solver.startGlobalLimit(500000, 30000);
    comparison = runPolicyComparison(solver, baseline.lambda, Math.min(1, CONFIG.comparisonCycles, Math.max(1, baseline.cycles)));
    solver.clearGlobalLimit();
  } else {
    comparison = {
      requestedCycles: 1,
      cycles: 0,
      complete: false,
      aborted: { reason: 'skipped because FRESH_DECK_BASELINE was incomplete' },
      l1AverageDistance: Number.NaN,
      hybridAverageDistance: Number.NaN,
      l1CycleCi95: [Number.NaN, Number.NaN],
      hybridCycleCi95: [Number.NaN, Number.NaN],
      improvementPerRound: Number.NaN,
      improvementPerRoundCi95: [Number.NaN, Number.NaN],
      independentMeanDifference: Number.NaN,
      l1Rounds: 0,
      hybridRounds: 0,
      l2CacheStates: 0,
    };
  }
  console.log('[9/9] determinism and report');
  const determinism = runDeterminismCheck(solver, baseline.lambda, collected.points);
  const totalElapsedMs = performance.now() - allStarted;

  const report = buildReport({
    performanceResult,
    correctness,
    baseline,
    unrestrictedProbe,
    l2Study,
    fullRollout,
    seedStudy,
    comparison,
    determinism,
    totalElapsedMs,
  });
  writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(`PROTOTYPE complete: ${REPORT_PATH}`);
  console.log(`Node ${process.version}; total ${formatNumber(totalElapsedMs / 1000, 3)} s`);
  console.log(`L1 p95 ${formatNumber(performanceResult.overall.elapsedMs.p95, 3)} ms; mobile x4 ${formatNumber(performanceResult.overall.elapsedMs.p95 * 4, 3)} ms`);
  console.log(`L2 adopted ${l2Study.adoptedCount}/${l2Study.rows.length}; cycle improvement ${formatNumber(comparison.improvementPerRound, 6)}`);
  console.log(`lambda ${formatNumber(baseline.lambda, 9)}; baseline rounds/cycle ${formatNumber(baseline.averageRounds, 6)}`);
  console.log(`4+7+6 ${correctness.standardRecommendation.action}; drawExpected ${formatNumber(correctness.standardRecommendation.withinRound.drawExpectedDistance, 12)}`);
  console.log(`score ${correctness.scorePassed ? 'PASS' : 'FAIL'}; brute ${correctness.bruteMismatchCount === 0 ? 'PASS' : 'FAIL'} (${correctness.bruteMismatchCount} mismatches)`);
}

if (process.argv.includes('--performance-child')) {
  performanceChildMain();
} else {
  main();
}
