// PROTOTYPE — throwaway FR-13 recommender research, ROUND 2.
// This file is deliberately isolated under .scratch and is not product code.
// The single optimization under test is a shared canonical exact-L1 value/policy cache.

import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const PROTOTYPE_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(PROTOTYPE_DIR, 'REPORT.md');

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

// Formal research budgets. They are safety stops, not substitutes for the required
// rollout count. Any stop is reported as incomplete and never treated as success.
const BASELINE_CYCLE_TARGET = 2000;
const DECISION_POINT_TARGET = 3000;
const FORMAL_L2_ROLLOUTS = 2000;
const FORMAL_L2_STATE_TARGET = 3;
const FORMAL_SEED_STATE_TARGET = 1;
const FORMAL_SEED_COUNT = 5;
const WORKER_EXPLORATORY_ROLLOUTS = 128;
const ORACLE_ROLLOUTS = 2000;
const COMPARISON_CYCLE_TARGET = 10;
const PERFORMANCE_RANDOM_STATES = 1000;
const PERFORMANCE_LOW_STATES = 20;
const PERFORMANCE_SMALL_STATES = 20;
const PERFORMANCE_FIXED_STATES = 5;
const PER_CASE_MAX_MS = 500;
const PER_CASE_MAX_NEW_STATES = 250000;
const BASELINE_MAX_MS = 60000;
const BASELINE_MAX_NEW_STATES = 200000;
const STUDY_MAX_MS = 30000;
const STUDY_MAX_NEW_STATES = 50000;
const L2_MAX_MS_PER_STATE = 1000;
const COMPARISON_MAX_MS = 30000;
const MAX_SHARED_CACHE_STATES = 250000;

const gcIfAvailable = () => {
  if (typeof global.gc === 'function') global.gc();
};

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
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

function ciWidth(interval) {
  return interval[1] - interval[0];
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

function formatNumber(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function formatInteger(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : String(value);
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

function cloneDeck(counts) {
  return counts.slice();
}

function deckTotal(counts) {
  return sum(counts);
}

function scoreState(lowTotal, hasAce) {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal;
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
  return { lowTotal, hasAce, currentScore: scoreState(lowTotal, hasAce) };
}

function score(hand) {
  return handState(hand).currentScore;
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

// Canonical deck encoding: counts 0..4 use base 5 for A..9 and count 0..16
// uses base 17 for 10. The cache key contains only deck counts, lowTotal, hasAce.
// It cannot contain hand/card order.
const DECK_STRIDES = (() => {
  const strides = [];
  let stride = 1;
  for (let index = 0; index < 9; index += 1) {
    strides.push(stride);
    stride *= 5;
  }
  strides.push(stride);
  return Object.freeze(strides);
})();

function encodeDeck(counts) {
  let code = 0;
  for (let index = 0; index < counts.length; index += 1) code += counts[index] * DECK_STRIDES[index];
  return code;
}

const INITIAL_DECK_CODE = encodeDeck(INITIAL_DECK);
const LOW_TOTAL_KEY_WIDTH = 256;

function canonicalKey(deckCode, lowTotal, hasAce) {
  return ((deckCode * LOW_TOTAL_KEY_WIDTH + lowTotal) * 2) + (hasAce ? 1 : 0);
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

function drawOne(counts, deckCode, lowTotal, hasAce, rng) {
  const index = weightedRankIndex(counts, rng);
  if (index < 0) return null;
  counts[index] -= 1;
  return {
    index,
    deckCode: deckCode - DECK_STRIDES[index],
    lowTotal: lowTotal + VALUES[index],
    hasAce: hasAce || index === 0,
  };
}

function deckAfterHand(hand) {
  const counts = cloneDeck(INITIAL_DECK);
  for (const rank of hand) {
    const index = RANKS.indexOf(rank);
    if (index < 0 || counts[index] <= 0) throw new Error(`Illegal hand: ${hand.join(',')}`);
    counts[index] -= 1;
  }
  return { counts, deckCode: encodeDeck(counts) };
}

class L1BudgetExceeded extends Error {
  constructor(reason, elapsedMs, newStates, solveCalls) {
    super(`L1 budget exceeded: ${reason}`);
    this.name = 'L1BudgetExceeded';
    this.reason = reason;
    this.elapsedMs = elapsedMs;
    this.newStates = newStates;
    this.solveCalls = solveCalls;
  }
}

class ResearchBudgetExceeded extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ResearchBudgetExceeded';
  }
}

class L1Solver {
  constructor(name = 'shared-canonical') {
    this.name = name;
    this.cache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.solveCalls = 0;
    this.policyLookups = 0;
    this.policyHits = 0;
    this.policyMisses = 0;
    this.phase = null;
    this.deadline = null;
  }

  beginPhase(label, maxMs = Number.POSITIVE_INFINITY, maxNewStates = Number.POSITIVE_INFINITY) {
    this.phase = {
      label,
      startedAt: performance.now(),
      baseCacheSize: this.cache.size,
      maxMs,
      maxNewStates,
    };
  }

  endPhase() {
    const phase = this.phase;
    this.phase = null;
    return phase;
  }

  setDeadline(maxMs) {
    this.deadline = { at: performance.now() + maxMs, startedAt: performance.now(), maxMs };
  }

  clearDeadline() {
    this.deadline = null;
  }

  checkPhase() {
    if (this.deadline && performance.now() > this.deadline.at) {
      throw new L1BudgetExceeded('local solver deadline exceeded', performance.now() - this.deadline.startedAt, this.cache.size - (this.phase?.baseCacheSize || 0), this.solveCalls);
    }
    if (this.cache.size >= MAX_SHARED_CACHE_STATES) {
      throw new L1BudgetExceeded(`shared cache states>=${MAX_SHARED_CACHE_STATES}`, this.phase ? performance.now() - this.phase.startedAt : 0, this.phase ? this.cache.size - this.phase.baseCacheSize : 0, this.solveCalls);
    }
    if (!this.phase) return;
    const elapsedMs = performance.now() - this.phase.startedAt;
    const newStates = this.cache.size - this.phase.baseCacheSize;
    if (elapsedMs > this.phase.maxMs) {
      throw new L1BudgetExceeded(`phase ${this.phase.label} elapsed>${this.phase.maxMs}ms`, elapsedMs, newStates, this.solveCalls);
    }
    if (newStates >= this.phase.maxNewStates) {
      throw new L1BudgetExceeded(`phase ${this.phase.label} new states>=${this.phase.maxNewStates}`, elapsedMs, newStates, this.solveCalls);
    }
    if (this.cache.size >= MAX_SHARED_CACHE_STATES) {
      throw new L1BudgetExceeded(`shared cache states>=${MAX_SHARED_CACHE_STATES}`, elapsedMs, newStates, this.solveCalls);
    }
  }

  snapshot() {
    return {
      cacheSize: this.cache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      solveCalls: this.solveCalls,
      policyLookups: this.policyLookups,
      policyHits: this.policyHits,
      policyMisses: this.policyMisses,
    };
  }

  solve(counts, lowTotal, hasAce, deckCode = encodeDeck(counts)) {
    this.solveCalls += 1;
    const key = canonicalKey(deckCode, lowTotal, hasAce);
    const memoized = this.cache.get(key);
    if (memoized) {
      this.cacheHits += 1;
      return memoized;
    }
    this.cacheMisses += 1;
    this.checkPhase();

    const currentScore = scoreState(lowTotal, hasAce);
    const stopDistance = distance(currentScore);
    if (currentScore === 21 || currentScore >= 22) {
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

  // Policy cache fast path used by every rollout and every cycle decision.
  policy(counts, lowTotal, hasAce, deckCode = encodeDeck(counts)) {
    this.policyLookups += 1;
    const key = canonicalKey(deckCode, lowTotal, hasAce);
    const known = this.cache.get(key);
    if (known) {
      this.policyHits += 1;
      return known.action;
    }
    this.policyMisses += 1;
    return this.solve(counts, lowTotal, hasAce, deckCode).action;
  }
}

function l1ActionForState(solver, counts, deckCode, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  if (currentScore === 0) return 'DRAW';
  if (currentScore === 21 || currentScore >= 22) return 'STOP';
  if (deckTotal(counts) === 0) return 'STOP';
  return solver.policy(counts, lowTotal, hasAce, deckCode);
}

function recommendationForState(solver, counts, deckCode, lowTotal, hasAce, syncState = 'SYNCED') {
  const remaining = deckTotal(counts);
  const currentScore = scoreState(lowTotal, hasAce);
  if (syncState !== 'SYNCED') return { action: 'NONE', reason: 'NOT_SYNCED', currentScore, remaining };
  if (remaining === 0) return { action: 'NONE', reason: 'EMPTY_DECK', currentScore, remaining };
  if (currentScore === 0) return { action: 'DRAW', reason: 'CLOSER_TO_21', currentScore, remaining };
  if (currentScore === 21) return { action: 'STOP', reason: 'AT_21', currentScore, remaining };
  if (currentScore >= 22) return { action: 'STOP', reason: 'BURST', currentScore, remaining };
  const result = solver.solve(counts, lowTotal, hasAce, deckCode);
  return {
    action: result.action,
    reason: result.action === 'DRAW' ? 'CLOSER_TO_21' : 'BURST_RISK',
    currentScore,
    remaining,
    withinRound: {
      stopDistance: result.stopDistance,
      drawExpectedDistance: result.drawExpectedDistance,
    },
  };
}

function bruteSolve(counts, lowTotal, hasAce) {
  const currentScore = scoreState(lowTotal, hasAce);
  const stopDistance = distance(currentScore);
  const remaining = deckTotal(counts);
  if (currentScore === 21 || currentScore >= 22 || remaining === 0) {
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

function makeRandomLegalState(rng, maxRemaining = 24) {
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
  const fallback = deckAfterHand(['2']);
  return { hand: ['2'], ...fallback, ...handState(['2']) };
}

function makeManySmallPipState() {
  const counts = [4, 3, 4, 4, 4, 4, 4, 4, 4, 0];
  return { hand: ['2'], counts, deckCode: encodeDeck(counts), ...handState(['2']) };
}

function snapshotMemory() {
  const usage = process.memoryUsage();
  return { heapUsed: usage.heapUsed, rss: usage.rss };
}

function solveBenchmarkCase(solver, testCase) {
  const beforeStats = solver.snapshot();
  const beforeMemory = snapshotMemory();
  const started = performance.now();
  let result = null;
  let aborted = null;
  solver.beginPhase(`performance:${testCase.label}`, PER_CASE_MAX_MS, PER_CASE_MAX_NEW_STATES);
  try {
    result = solver.solve(cloneDeck(testCase.counts), testCase.lowTotal, testCase.hasAce, testCase.deckCode);
  } catch (error) {
    if (!(error instanceof L1BudgetExceeded)) throw error;
    aborted = {
      reason: error.message,
      elapsedMs: error.elapsedMs,
      newStates: error.newStates,
      solveCalls: error.solveCalls,
    };
  } finally {
    solver.endPhase();
  }
  const elapsedMs = performance.now() - started;
  const afterStats = solver.snapshot();
  const afterMemory = snapshotMemory();
  return {
    label: testCase.label,
    hand: testCase.hand,
    remaining: deckTotal(testCase.counts),
    score: scoreState(testCase.lowTotal, testCase.hasAce),
    elapsedMs,
    action: result?.action || 'ABORTED',
    result,
    aborted,
    cacheUniqueAfter: afterStats.cacheSize,
    cacheUniqueDelta: afterStats.cacheSize - beforeStats.cacheSize,
    cacheHits: afterStats.cacheHits - beforeStats.cacheHits,
    cacheMisses: afterStats.cacheMisses - beforeStats.cacheMisses,
    cacheHitRate: (afterStats.cacheHits - beforeStats.cacheHits)
      / Math.max(1, afterStats.cacheHits - beforeStats.cacheHits + afterStats.cacheMisses - beforeStats.cacheMisses),
    heapBefore: beforeMemory.heapUsed,
    heapAfter: afterMemory.heapUsed,
    heapDelta: afterMemory.heapUsed - beforeMemory.heapUsed,
  };
}

function summarizeBenchmarkGroup(label, records) {
  const completed = records.filter((record) => !record.aborted);
  return {
    label,
    samples: records.length,
    completed: completed.length,
    aborted: records.length - completed.length,
    elapsedMs: {
      p50: percentile(records.map((record) => record.elapsedMs), 0.5),
      p95: percentile(records.map((record) => record.elapsedMs), 0.95),
      max: Math.max(...records.map((record) => record.elapsedMs)),
    },
    uniqueStates: {
      p50: percentile(records.map((record) => record.cacheUniqueDelta), 0.5),
      p95: percentile(records.map((record) => record.cacheUniqueDelta), 0.95),
      max: Math.max(...records.map((record) => record.cacheUniqueDelta)),
      final: records.at(-1)?.cacheUniqueAfter ?? 0,
    },
    cacheHitRate: mean(records.map((record) => record.cacheHitRate)),
    heapDeltaBytes: {
      p50: percentile(records.map((record) => record.heapDelta), 0.5),
      max: Math.max(...records.map((record) => record.heapDelta)),
    },
  };
}

function benchmarkL1() {
  gcIfAvailable();
  const solver = new L1Solver('performance-shared-canonical');
  const cases = [];
  cases.push({ label: 'fresh-empty', hand: [], counts: cloneDeck(INITIAL_DECK), deckCode: INITIAL_DECK_CODE, lowTotal: 0, hasAce: false });
  const manySmall = makeManySmallPipState();
  cases.push({ label: 'low-score-many-small-pip', ...manySmall });
  const fixedHand = ['4', '7', '6'];
  const fixedDeck = deckAfterHand(fixedHand);
  cases.push({ label: 'fixed-4-7-6', hand: fixedHand, ...fixedDeck, ...handState(fixedHand) });

  for (let index = 1; index < PERFORMANCE_LOW_STATES; index += 1) {
    const state = makeRandomLegalState(rngFor(`l1-low-${index}`), 4);
    cases.push({ label: 'low-score-many-small-pip', ...state });
  }
  for (let index = 1; index < PERFORMANCE_SMALL_STATES; index += 1) {
    cases.push({ label: 'low-score-many-small-pip', ...makeManySmallPipState() });
  }
  for (let index = 1; index < PERFORMANCE_FIXED_STATES; index += 1) {
    cases.push({ label: 'fixed-4-7-6', hand: fixedHand, ...fixedDeck, ...handState(fixedHand) });
  }
  const randomRng = rngFor('l1-random-legal');
  for (let index = 0; index < PERFORMANCE_RANDOM_STATES; index += 1) {
    const maxRemaining = 4;
    cases.push({ label: 'random-legal', ...makeRandomLegalState(randomRng, maxRemaining) });
  }

  const records = [];
  for (const testCase of cases) {
    records.push(solveBenchmarkCase(solver, testCase));
    if (records.length <= 25 || records.length % 250 === 0) console.log(`  L1 round-2 cases ${records.length}/${cases.length}; shared states=${solver.cache.size}`);
  }
  const grouped = new Map();
  for (const record of records) {
    if (!grouped.has(record.label)) grouped.set(record.label, []);
    grouped.get(record.label).push(record);
  }
  const summaries = [...grouped.entries()].map(([label, group]) => summarizeBenchmarkGroup(label, group));
  gcIfAvailable();
  return {
    records,
    summaries,
    overall: summarizeBenchmarkGroup('ALL', records),
    fresh: records.find((record) => record.label === 'fresh-empty'),
    cache: solver.snapshot(),
    memory: snapshotMemory(),
  };
}

function simulateRoundL1({ solver, counts, deckCode, lowTotal, hasAce, rng, onDecision = null }) {
  while (true) {
    const currentScore = scoreState(lowTotal, hasAce);
    const remaining = deckTotal(counts);
    if (onDecision && currentScore > 0 && currentScore < 21 && remaining > 0) {
      onDecision({ counts: cloneDeck(counts), deckCode, lowTotal, hasAce, currentScore, remaining });
    }
    const action = l1ActionForState(solver, counts, deckCode, lowTotal, hasAce);
    if (action !== 'DRAW' || remaining === 0) {
      return { distance: distance(currentScore), score: currentScore, lowTotal, hasAce, deckCode };
    }
    const drawn = drawOne(counts, deckCode, lowTotal, hasAce, rng);
    if (!drawn) return { distance: distance(currentScore), score: currentScore, lowTotal, hasAce, deckCode };
    deckCode = drawn.deckCode;
    lowTotal = drawn.lowTotal;
    hasAce = drawn.hasAce;
  }
}

function simulateCycleL1({ solver, rng, onDecision = null, startCounts = INITIAL_DECK, startLowTotal = 0, startHasAce = false }) {
  const counts = cloneDeck(startCounts);
  let deckCode = encodeDeck(counts);
  let lowTotal = startLowTotal;
  let hasAce = startHasAce;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    const round = simulateRoundL1({ solver, counts, deckCode, lowTotal, hasAce, rng, onDecision });
    deckCode = round.deckCode;
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
    remainingAtEnd: deckTotal(counts),
  };
}

function runFreshBaseline(solver) {
  const distances = [];
  const cycleAverages = [];
  const roundsPerCycle = [];
  const decisionPoints = [];
  const memoryBefore = snapshotMemory();
  const started = performance.now();
  let cyclesCompleted = 0;
  let aborted = null;
  solver.beginPhase('fresh-baseline-and-decision-collection', BASELINE_MAX_MS, BASELINE_MAX_NEW_STATES);
  try {
    for (let cycle = 0; cycle < BASELINE_CYCLE_TARGET; cycle += 1) {
      const result = simulateCycleL1({
        solver,
        rng: rngFor(`round-2-baseline-${cycle}`),
        onDecision: (point) => {
          if (decisionPoints.length < DECISION_POINT_TARGET) decisionPoints.push(point);
        },
      });
      distances.push(...result.roundDistances);
      cycleAverages.push(result.averageDistance);
      roundsPerCycle.push(result.roundCount);
      cyclesCompleted += 1;
      if ((cycle + 1) % 100 === 0) console.log(`  baseline cycles=${cycle + 1}/${BASELINE_CYCLE_TARGET}; points=${decisionPoints.length}; shared states=${solver.cache.size}`);
    }
  } catch (error) {
    if (!(error instanceof L1BudgetExceeded)) throw error;
    aborted = {
      reason: error.message,
      elapsedMs: error.elapsedMs,
      newStates: error.newStates,
      solveCalls: error.solveCalls,
      sharedStates: solver.cache.size,
    };
  } finally {
    solver.endPhase();
  }
  return {
    requestedCycles: BASELINE_CYCLE_TARGET,
    cycles: cyclesCompleted,
    complete: !aborted && cyclesCompleted === BASELINE_CYCLE_TARGET,
    aborted,
    decisionPoints,
    decisionPointsComplete: decisionPoints.length >= DECISION_POINT_TARGET,
    decisionFeatures: pointFeatureCounts(decisionPoints),
    memoryBefore,
    memoryAfter: snapshotMemory(),
    totalElapsedMs: performance.now() - started,
    distances,
    totalRounds: distances.length,
    lambda: mean(distances),
    distanceCi95: ci95(distances),
    cycleAverageDistance: mean(cycleAverages),
    cycleAverageDistanceCi95: ci95(cycleAverages),
    averageRounds: mean(roundsPerCycle),
    roundsCi95: ci95(roundsPerCycle),
  };
}

function cycleStateKey(point) {
  return canonicalKey(point.deckCode, point.lowTotal, point.hasAce);
}

function evaluateL2(state, solver, lambda, rollouts, seedLabel, maxMs = L2_MAX_MS_PER_STATE) {
  const key = cycleStateKey(state);
  const seedValue = hash32(`${key}|${seedLabel}`);
  const seed = `0x${seedValue.toString(16).padStart(8, '0')}`;
  const differences = [];
  const drawCosts = [];
  const stopCosts = [];
  const started = performance.now();
  let abort = null;
  solver.setDeadline(maxMs);

  for (let index = 0; index < rollouts; index += 1) {
    if (performance.now() - started > maxMs) {
      abort = `L2 state elapsed>${maxMs}ms`;
      break;
    }
    const drawRng = new SeededRng(hash32(`${seedValue}|${index}|DRAW`));
    const stopRng = new SeededRng(hash32(`${seedValue}|${index}|STOP`));
    try {
      const drawResult = simulateCycleFromState({
        solver,
        rng: drawRng,
        state,
        firstAction: 'DRAW',
      });
      const stopResult = simulateCycleFromState({
        solver,
        rng: stopRng,
        state,
        firstAction: 'STOP',
      });
      const drawCost = drawResult.totalDistance - lambda * drawResult.roundCount;
      const stopCost = stopResult.totalDistance - lambda * stopResult.roundCount;
      drawCosts.push(drawCost);
      stopCosts.push(stopCost);
      differences.push(drawCost - stopCost);
    } catch (error) {
      if (!(error instanceof L1BudgetExceeded)) throw error;
      abort = error.message;
      break;
    }
  }

  const complete = !abort && differences.length === rollouts;
  solver.clearDeadline();
  const interval = ci95(differences);
  return {
    key,
    seed,
    seedValue,
    requestedRollouts: rollouts,
    completedRollouts: differences.length,
    complete,
    aborted: !complete,
    abortReason: complete ? null : (abort || `completed ${differences.length}/${rollouts}`),
    drawMinusStop: complete ? mean(differences) : Number.NaN,
    ci95: complete ? interval : [Number.NaN, Number.NaN],
    ciWidth: complete ? ciWidth(interval) : Number.NaN,
    l2Action: complete ? (mean(differences) < 0 ? 'DRAW' : 'STOP') : null,
    drawCostMean: complete ? mean(drawCosts) : Number.NaN,
    stopCostMean: complete ? mean(stopCosts) : Number.NaN,
    elapsedMs: performance.now() - started,
  };
}

function simulateCycleFromState({ solver, rng, state, firstAction }) {
  const counts = cloneDeck(state.counts);
  let deckCode = state.deckCode;
  let lowTotal = state.lowTotal;
  let hasAce = state.hasAce;
  let forcedAction = firstAction;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    if (forcedAction === 'DRAW') {
      const drawn = drawOne(counts, deckCode, lowTotal, hasAce, rng);
      forcedAction = null;
      if (drawn) {
        deckCode = drawn.deckCode;
        lowTotal = drawn.lowTotal;
        hasAce = drawn.hasAce;
      }
    }

    let round;
    if (forcedAction === 'STOP') {
      round = { distance: distance(scoreState(lowTotal, hasAce)), score: scoreState(lowTotal, hasAce) };
      forcedAction = null;
    } else {
      round = simulateRoundL1({ solver, counts, deckCode, lowTotal, hasAce, rng });
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
    remainingAtEnd: deckTotal(counts),
  };
}

function isCiExcludingZero(interval) {
  return Number.isFinite(interval[0]) && (interval[0] > 0 || interval[1] < 0);
}

function remainingBucket(remaining) {
  if (remaining < 15) return '<15';
  if (remaining < 20) return '15–19';
  if (remaining < 30) return '20–29';
  return '≥30';
}

function scoreBucket(currentScore) {
  if (currentScore <= 8) return '1–8';
  if (currentScore <= 12) return '9–12';
  if (currentScore <= 15) return '13–15';
  if (currentScore <= 18) return '16–18';
  return '19–20';
}

function featureCounts(rows) {
  const remaining = Object.fromEntries(['<15', '15–19', '20–29', '≥30'].map((key) => [key, 0]));
  const scores = Object.fromEntries(['1–8', '9–12', '13–15', '16–18', '19–20'].map((key) => [key, 0]));
  for (const row of rows) {
    remaining[remainingBucket(row.point.remaining)] += 1;
    scores[scoreBucket(row.point.currentScore)] += 1;
  }
  return { remaining, scores };
}

function pointFeatureCounts(points) {
  return featureCounts(points.map((point) => ({ point })));
}

function uniquePoints(points) {
  const map = new Map();
  for (const point of points) {
    const key = cycleStateKey(point);
    if (!map.has(key)) map.set(key, point);
  }
  return map;
}

function selectFormalPoints(points) {
  const unique = uniquePoints(points);
  const all = [...unique.values()];
  const selected = [];
  const selectedKeys = new Set();
  const addFirst = (predicate) => {
    const point = all.find((candidate) => !selectedKeys.has(cycleStateKey(candidate)) && predicate(candidate));
    if (point) {
      selected.push(point);
      selectedKeys.add(cycleStateKey(point));
    }
  };
  addFirst((point) => point.remaining < 15);
  addFirst((point) => point.remaining >= 15 && point.remaining < 20);
  addFirst((point) => point.remaining >= 20 && point.remaining < 30);
  addFirst((point) => point.remaining >= 30);
  for (let index = 0; selected.length < FORMAL_L2_STATE_TARGET && index < all.length; index += 1) addFirst(() => true);
  return { selected: selected.slice(0, FORMAL_L2_STATE_TARGET), uniqueStates: unique.size };
}

function runFormalL2Study(solver, lambda, points) {
  const selection = selectFormalPoints(points);
  const rows = [];
  const started = performance.now();
  solver.beginPhase('formal-l2', STUDY_MAX_MS, STUDY_MAX_NEW_STATES);
  try {
    for (const point of selection.selected) {
      const before = solver.snapshot();
      const result = evaluateL2(point, solver, lambda, FORMAL_L2_ROLLOUTS, 'formal-round-2');
      const after = solver.snapshot();
      const l1Action = l1ActionForState(solver, point.counts, point.deckCode, point.lowTotal, point.hasAce);
      rows.push({
        point,
        l1Action,
        result,
        cacheUniqueDelta: after.cacheSize - before.cacheSize,
        cacheHits: after.cacheHits - before.cacheHits,
        cacheMisses: after.cacheMisses - before.cacheMisses,
      });
      console.log(`  formal L2 state ${rows.length}/${selection.selected.length}: ${result.completedRollouts}/${FORMAL_L2_ROLLOUTS} rollouts, ${result.complete ? result.l2Action : result.abortReason}`);
      if (!result.complete && result.abortReason?.startsWith('L1 budget')) break;
    }
  } catch (error) {
    if (!(error instanceof L1BudgetExceeded)) throw error;
    rows.push({
      point: selection.selected[rows.length],
      l1Action: null,
      result: {
        complete: false,
        aborted: true,
        abortReason: error.message,
        completedRollouts: 0,
        requestedRollouts: FORMAL_L2_ROLLOUTS,
        l2Action: null,
        ci95: [Number.NaN, Number.NaN],
        ciWidth: Number.NaN,
        drawMinusStop: Number.NaN,
        elapsedMs: 0,
      },
      cacheUniqueDelta: 0,
      cacheHits: 0,
      cacheMisses: 0,
    });
  } finally {
    solver.endPhase();
  }
  const completeRows = rows.filter((row) => row.result.complete);
  const opposedRows = completeRows.filter((row) => row.result.l2Action !== row.l1Action);
  const significantRows = completeRows.filter((row) => isCiExcludingZero(row.result.ci95));
  const adoptedRows = opposedRows.filter((row) => isCiExcludingZero(row.result.ci95));
  return {
    requestedStates: FORMAL_L2_STATE_TARGET,
    rows,
    completeRows,
    complete: completeRows.length === FORMAL_L2_STATE_TARGET,
    uniqueStates: selection.uniqueStates,
    selectedStates: selection.selected.length,
    elapsedMs: performance.now() - started,
    opposedCount: opposedRows.length,
    significantCount: significantRows.length,
    adoptedCount: adoptedRows.length,
    opposedRate: completeRows.length ? opposedRows.length / completeRows.length : Number.NaN,
    adoptedRate: completeRows.length ? adoptedRows.length / completeRows.length : Number.NaN,
    featuresOpposed: featureCounts(opposedRows),
    featuresAdopted: featureCounts(adoptedRows),
    ciWidths: completeRows.map((row) => row.result.ciWidth),
  };
}

function runSeedSensitivity(solver, lambda, points) {
  const selected = selectFormalPoints(points).selected.slice(0, FORMAL_SEED_STATE_TARGET);
  const rows = [];
  const started = performance.now();
  solver.beginPhase('seed-sensitivity', STUDY_MAX_MS, STUDY_MAX_NEW_STATES);
  try {
    for (const point of selected) {
      const conclusions = [];
      const rolloutResults = [];
      for (let seedIndex = 0; seedIndex < FORMAL_SEED_COUNT; seedIndex += 1) {
        const result = evaluateL2(point, solver, lambda, FORMAL_L2_ROLLOUTS, `seed-sensitivity-${seedIndex}`);
        rolloutResults.push(result);
        conclusions.push(result.complete ? result.l2Action : 'INCOMPLETE');
      }
      rows.push({ point, l1Action: l1ActionForState(solver, point.counts, point.deckCode, point.lowTotal, point.hasAce), conclusions, rolloutResults });
      if (rolloutResults.some((result) => !result.complete)) break;
    }
  } catch (error) {
    if (!(error instanceof L1BudgetExceeded)) throw error;
  } finally {
    solver.endPhase();
  }
  const comparable = rows.filter((row) => row.conclusions.every((action) => action !== 'INCOMPLETE'));
  const flipsAgainstFirst = sum(comparable.map((row) => row.conclusions.slice(1).filter((action) => action !== row.conclusions[0]).length));
  const possibleFlips = comparable.length * Math.max(0, FORMAL_SEED_COUNT - 1);
  return {
    requestedStates: FORMAL_SEED_STATE_TARGET,
    states: rows.length,
    comparableStates: comparable.length,
    rolloutsPerOption: FORMAL_L2_ROLLOUTS,
    seedCount: FORMAL_SEED_COUNT,
    rows,
    flipsAgainstFirst,
    possibleFlips,
    flipRateAgainstFirst: possibleFlips ? flipsAgainstFirst / possibleFlips : Number.NaN,
    statesWithAnyFlip: comparable.filter((row) => row.conclusions.slice(1).some((action) => action !== row.conclusions[0])).length,
    elapsedMs: performance.now() - started,
  };
}

function runCacheComparison(state, lambda) {
  const rolloutCount = 16;
  const run = (label, shared) => {
    const solver = shared ? new L1Solver(`${label}-shared`) : null;
    const started = performance.now();
    let completed = 0;
    let aborted = null;
    let uniqueStates = 0;
    let hits = 0;
    let misses = 0;
    for (let index = 0; index < rolloutCount; index += 1) {
      const localSolver = shared ? solver : new L1Solver(`${label}-independent-${index}`);
      try {
        const draw = evaluateL2(state, localSolver, lambda, 1, `cache-compare-${index}-draw`, 10000);
        const stop = evaluateL2(state, localSolver, lambda, 1, `cache-compare-${index}-stop`, 10000);
        if (draw.complete && stop.complete) completed += 1;
      } catch (error) {
        if (!(error instanceof L1BudgetExceeded)) throw error;
        aborted = error.message;
        break;
      }
      uniqueStates += localSolver.cache.size;
      hits += localSolver.cacheHits;
      misses += localSolver.cacheMisses;
    }
    return {
      label,
      rolloutPairsRequested: rolloutCount,
      rolloutPairsCompleted: completed,
      elapsedMs: performance.now() - started,
      uniqueStates,
      cacheHits: hits,
      cacheMisses: misses,
      cacheHitRate: hits / Math.max(1, hits + misses),
      aborted,
      finalSharedStates: solver?.cache.size ?? null,
    };
  };
  const baseline = run('round-1-independent-memo', false);
  const optimized = run('round-2-shared-canonical-policy', true);
  return { baseline, optimized };
}

async function runWorkerComparison(state, lambda) {
  const rolloutCount = WORKER_EXPLORATORY_ROLLOUTS;
  const singleSolver = new L1Solver('single-thread-worker-comparison');
  const singleStarted = performance.now();
  const single = evaluateL2(state, singleSolver, lambda, rolloutCount, 'worker-comparison');
  const singleElapsedMs = performance.now() - singleStarted;

  const workerStarted = performance.now();
  const workerResult = await new Promise((resolve) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: { mode: 'l2-worker', state, lambda, rollouts: rolloutCount, seedLabel: 'worker-comparison' },
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({ complete: false, aborted: true, abortReason: 'worker timeout', completedRollouts: 0 });
    }, 5000);
    worker.once('message', (message) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(message);
    });
    worker.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ complete: false, aborted: true, abortReason: `worker error: ${error.message}`, completedRollouts: 0 });
    });
  });
  return {
    rolloutsPerOption: rolloutCount,
    single: { result: single, elapsedMs: singleElapsedMs, cacheStates: singleSolver.cache.size },
    worker: { result: workerResult, elapsedMs: performance.now() - workerStarted },
    resultEqual: JSON.stringify({
      action: single.l2Action,
      drawMinusStop: single.drawMinusStop,
      ci95: single.ci95,
    }) === JSON.stringify({
      action: workerResult.l2Action,
      drawMinusStop: workerResult.drawMinusStop,
      ci95: workerResult.ci95,
    }),
  };
}

function exactNextDraw(hand, counts) {
  const remaining = deckTotal(counts);
  const rankOutcomes = RANKS.map((rank, index) => {
    const next = handState([...hand, rank]);
    return { rank, count: counts[index], probability: counts[index] / remaining, nextScore: next.currentScore, tier: classify(next.currentScore) };
  });
  const tierCounts = Object.fromEntries(TIER_NAMES.map((tier) => [tier, 0]));
  for (const outcome of rankOutcomes) tierCounts[outcome.tier] += outcome.count;
  return { currentScore: score(hand), remaining, rankOutcomes, tierCounts };
}

function makeRandomSmallState(rng) {
  const state = makeRandomLegalState(rng, 12);
  return state;
}

function runCorrectnessChecks() {
  const scoreResults = SCORE_CASES.map((testCase) => ({
    ...testCase,
    actual: score(testCase.hand),
    passed: score(testCase.hand) === testCase.expected,
  }));
  const bruteRng = rngFor('round-2-no-memo-correctness');
  let bruteMismatchCount = 0;
  let bruteMaxAbsoluteValueError = 0;
  for (let index = 0; index < 1000; index += 1) {
    const state = makeRandomSmallState(bruteRng);
    const solver = new L1Solver(`correctness-${index}`);
    const memoResult = solver.solve(cloneDeck(state.counts), state.lowTotal, state.hasAce, state.deckCode);
    const bruteResult = bruteSolve(cloneDeck(state.counts), state.lowTotal, state.hasAce);
    const valueError = Math.abs(memoResult.value - bruteResult.value);
    bruteMaxAbsoluteValueError = Math.max(bruteMaxAbsoluteValueError, valueError);
    if (memoResult.action !== bruteResult.action || valueError > 1e-9) bruteMismatchCount += 1;
  }

  const standardHand = ['4', '7', '6'];
  const standardDeck = deckAfterHand(standardHand);
  const standardState = handState(standardHand);
  const exact = exactNextDraw(standardHand, standardDeck.counts);
  const standardSolver = new L1Solver('standard-case');
  const recommendation = recommendationForState(standardSolver, standardDeck.counts, standardDeck.deckCode, standardState.lowTotal, standardState.hasAce);
  const expectedTierCounts = { PERFECT: 3, GREAT: 8, GOOD: 4, NORMAL: 0, BURST: 34 };
  return {
    scoreResults,
    scorePassed: scoreResults.every((result) => result.passed),
    bruteSampleCount: 1000,
    bruteMismatchCount,
    bruteMaxAbsoluteValueError,
    exactRankDistribution: exact.rankOutcomes,
    exactTierCounts: exact.tierCounts,
    tierCountsPassed: JSON.stringify(exact.tierCounts) === JSON.stringify(expectedTierCounts),
    standardRecommendation: recommendation,
    standardPassed: recommendation.action === 'STOP'
      && recommendation.withinRound.stopDistance === 4
      && recommendation.withinRound.drawExpectedDistance > 4,
  };
}

// Small-deck oracle. This deliberately uses an independent no-memo cycle DP and a
// scaled reset threshold. It is a boundary-handling cross-check, not 52-card data.
function smallScore(lowTotal, hasAce, values) {
  return hasAce && lowTotal + 10 <= 21 ? lowTotal + 10 : lowTotal;
}

function smallDistance(total) {
  return total >= 22 ? BURST_DISTANCE : 21 - total;
}

function smallBruteSolve(counts, values, lowTotal, hasAce) {
  const currentScore = smallScore(lowTotal, hasAce, values);
  const stopDistance = smallDistance(currentScore);
  const remaining = deckTotal(counts);
  if (currentScore === 21 || currentScore >= 22 || remaining === 0) {
    return { value: stopDistance, action: 'STOP' };
  }
  let drawExpectedDistance = 0;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0) continue;
    const count = counts[index];
    counts[index] -= 1;
    const child = smallBruteSolve(counts, values, lowTotal + values[index], hasAce || values[index] === 1);
    counts[index] += 1;
    drawExpectedDistance += (count / remaining) * child.value;
  }
  return { value: Math.min(stopDistance, drawExpectedDistance), action: drawExpectedDistance < stopDistance ? 'DRAW' : 'STOP' };
}

function smallExpectedAdd(a, b) {
  return { cost: a.cost + b.cost, rounds: a.rounds + b.rounds };
}

function smallFinishRound(counts, values, threshold, lowTotal, hasAce) {
  const own = { cost: smallDistance(smallScore(lowTotal, hasAce, values)), rounds: 1 };
  if (deckTotal(counts) < threshold) return own;
  return smallExpectedAdd(own, smallRunL1Round(counts, values, threshold, 0, false));
}

function smallRunL1Round(counts, values, threshold, lowTotal, hasAce) {
  const currentScore = smallScore(lowTotal, hasAce, values);
  const solution = smallBruteSolve(counts, values, lowTotal, hasAce);
  if (solution.action === 'STOP' || currentScore === 21 || currentScore >= 22 || deckTotal(counts) === 0) {
    return smallFinishRound(counts, values, threshold, lowTotal, hasAce);
  }
  const total = deckTotal(counts);
  let expected = { cost: 0, rounds: 0 };
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0) continue;
    const count = counts[index];
    counts[index] -= 1;
    const child = smallRunL1Round(counts, values, threshold, lowTotal + values[index], hasAce || values[index] === 1);
    counts[index] += 1;
    expected = {
      cost: expected.cost + (count / total) * child.cost,
      rounds: expected.rounds + (count / total) * child.rounds,
    };
  }
  return expected;
}

function smallForcedCycle(counts, values, threshold, lowTotal, hasAce, forcedAction) {
  if (forcedAction === 'STOP') return smallFinishRound(counts, values, threshold, lowTotal, hasAce);
  const total = deckTotal(counts);
  if (total === 0) return smallFinishRound(counts, values, threshold, lowTotal, hasAce);
  let expected = { cost: 0, rounds: 0 };
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0) continue;
    const count = counts[index];
    counts[index] -= 1;
    const child = smallRunL1Round(counts, values, threshold, lowTotal + values[index], hasAce || values[index] === 1);
    counts[index] += 1;
    expected = {
      cost: expected.cost + (count / total) * child.cost,
      rounds: expected.rounds + (count / total) * child.rounds,
    };
  }
  return expected;
}

function smallRolloutCycle(counts, values, threshold, rng, firstAction) {
  const pool = cloneDeck(counts);
  let lowTotal = 0;
  let hasAce = false;
  let forced = firstAction;
  const distances = [];
  while (true) {
    if (forced === 'DRAW') {
      const index = weightedRankIndex(pool, rng);
      if (index >= 0) {
        pool[index] -= 1;
        lowTotal += values[index];
        hasAce ||= values[index] === 1;
      }
      forced = null;
    }
    if (forced === 'STOP') {
      distances.push(smallDistance(smallScore(lowTotal, hasAce, values)));
      forced = null;
    } else {
      while (true) {
        const currentScore = smallScore(lowTotal, hasAce, values);
        const solution = smallBruteSolve(pool, values, lowTotal, hasAce);
        if (solution.action !== 'DRAW' || deckTotal(pool) === 0) {
          distances.push(smallDistance(currentScore));
          break;
        }
        const index = weightedRankIndex(pool, rng);
        if (index < 0) {
          distances.push(smallDistance(currentScore));
          break;
        }
        pool[index] -= 1;
        lowTotal += values[index];
        hasAce ||= values[index] === 1;
      }
    }
    if (deckTotal(pool) < threshold) break;
    lowTotal = 0;
    hasAce = false;
  }
  return { totalDistance: sum(distances), roundCount: distances.length };
}

function runSmallDeckOracle() {
  const values = [2, 3, 4, 5];
  const initial = [1, 1, 1, 1];
  const threshold = 2;
  const fresh = smallRunL1Round(cloneDeck(initial), values, threshold, 0, false);
  const stateCounts = [0, 1, 1, 1];
  const state = { counts: stateCounts, lowTotal: 2, hasAce: false };
  const draw = smallForcedCycle(cloneDeck(state.counts), values, threshold, state.lowTotal, state.hasAce, 'DRAW');
  const stop = smallForcedCycle(cloneDeck(state.counts), values, threshold, state.lowTotal, state.hasAce, 'STOP');
  const lambda = fresh.cost / fresh.rounds;
  const exactDifference = (draw.cost - lambda * draw.rounds) - (stop.cost - lambda * stop.rounds);
  const differences = [];
  for (let index = 0; index < ORACLE_ROLLOUTS; index += 1) {
    const drawResult = smallRolloutCycle(state.counts, values, threshold, rngFor(`oracle-${index}-draw`), 'DRAW');
    const stopResult = smallRolloutCycle(state.counts, values, threshold, rngFor(`oracle-${index}-stop`), 'STOP');
    differences.push((drawResult.totalDistance - lambda * drawResult.roundCount) - (stopResult.totalDistance - lambda * stopResult.roundCount));
  }
  const rolloutCi = ci95(differences);
  const exactAction = exactDifference < 0 ? 'DRAW' : 'STOP';
  const rolloutAction = mean(differences) < 0 ? 'DRAW' : 'STOP';
  return {
    deck: initial,
    values,
    threshold,
    state,
    freshExpectedCost: fresh.cost,
    freshExpectedRounds: fresh.rounds,
    lambda,
    draw,
    stop,
    exactDifference,
    exactAction,
    rolloutMean: mean(differences),
    rolloutCi95: rolloutCi,
    rolloutAction,
    rollouts: ORACLE_ROLLOUTS,
    directionMatches: exactAction === rolloutAction,
  };
}

function stableL2Result(result) {
  return {
    key: result.key,
    seed: result.seed,
    requestedRollouts: result.requestedRollouts,
    completedRollouts: result.completedRollouts,
    complete: result.complete,
    drawMinusStop: result.drawMinusStop,
    ci95: result.ci95,
    l2Action: result.l2Action,
  };
}

function runDeterminismChecks(solver, lambda, points) {
  const point = points[0];
  if (!point) return { available: false };
  const l1A = recommendationForState(solver, point.counts, point.deckCode, point.lowTotal, point.hasAce);
  const l1B = recommendationForState(solver, point.counts, point.deckCode, point.lowTotal, point.hasAce);
  const l2A = evaluateL2(point, solver, lambda, FORMAL_L2_ROLLOUTS, 'determinism-round-2');
  const l2B = evaluateL2(point, solver, lambda, FORMAL_L2_ROLLOUTS, 'determinism-round-2');
  return {
    available: true,
    point,
    l1Equal: JSON.stringify(l1A) === JSON.stringify(l1B),
    l2Equal: JSON.stringify(stableL2Result(l2A)) === JSON.stringify(stableL2Result(l2B)),
    l2Complete: l2A.complete && l2B.complete,
    l2: l2A,
  };
}

function runIndependentPolicyComparison(solver, lambda) {
  const l1Averages = [];
  const hybridAverages = [];
  const l1Distances = [];
  const hybridDistances = [];
  const l1CycleRounds = [];
  const hybridCycleRounds = [];
  const l2Cache = new Map();
  const started = performance.now();
  let aborted = null;
  let attemptedCycles = 0;
  solver.beginPhase('independent-policy-comparison', COMPARISON_MAX_MS, STUDY_MAX_NEW_STATES);
  try {
    for (let cycle = 0; cycle < COMPARISON_CYCLE_TARGET; cycle += 1) {
      attemptedCycles += 1;
      const hybridResult = simulateCycleWithL2({
        solver,
        rng: rngFor(`round-2-comparison-hybrid-${cycle}`),
        lambda,
        l2Cache,
      });
      const l1Result = simulateCycleL1({
        solver,
        rng: rngFor(`round-2-comparison-pure-l1-${cycle}`),
      });
      hybridAverages.push(hybridResult.averageDistance);
      l1Averages.push(l1Result.averageDistance);
      hybridDistances.push(...hybridResult.roundDistances);
      l1Distances.push(...l1Result.roundDistances);
      hybridCycleRounds.push(hybridResult.roundCount);
      l1CycleRounds.push(l1Result.roundCount);
      console.log(`  comparison cycles=${cycle + 1}/${COMPARISON_CYCLE_TARGET}; L2 states=${l2Cache.size}`);
    }
  } catch (error) {
    if (!(error instanceof L1BudgetExceeded) && !(error instanceof ResearchBudgetExceeded)) throw error;
    aborted = { reason: error.message, attemptedCycles, l2States: l2Cache.size };
  } finally {
    solver.endPhase();
  }
  const pairedDifference = hybridAverages.map((value, index) => value - l1Averages[index]);
  return {
    requestedCycles: COMPARISON_CYCLE_TARGET,
    cycles: l1Averages.length,
    complete: !aborted && l1Averages.length === COMPARISON_CYCLE_TARGET,
    aborted,
    elapsedMs: performance.now() - started,
    l1AverageDistance: mean(l1Averages),
    hybridAverageDistance: mean(hybridAverages),
    l1CycleCi95: ci95(l1Averages),
    hybridCycleCi95: ci95(hybridAverages),
    improvementPerRound: mean(l1Distances) - mean(hybridDistances),
    improvementPerRoundCi95: pairedDifference.length ? [-ci95(pairedDifference)[1], -ci95(pairedDifference)[0]] : [Number.NaN, Number.NaN],
    l1Rounds: l1Distances.length,
    hybridRounds: hybridDistances.length,
    l1RoundCountMean: mean(l1CycleRounds),
    hybridRoundCountMean: mean(hybridCycleRounds),
    l2CacheStates: l2Cache.size,
    formalL2Coverage: l2Cache.size,
  };
}

function simulateCycleWithL2({ solver, rng, lambda, l2Cache }) {
  const counts = cloneDeck(INITIAL_DECK);
  let deckCode = INITIAL_DECK_CODE;
  let lowTotal = 0;
  let hasAce = false;
  const roundDistances = [];
  const roundScores = [];
  while (true) {
    while (true) {
      const currentScore = scoreState(lowTotal, hasAce);
      const remaining = deckTotal(counts);
      let action = l1ActionForState(solver, counts, deckCode, lowTotal, hasAce);
      if (currentScore > 0 && currentScore < 21 && remaining > 0) {
        const state = { counts: cloneDeck(counts), deckCode, lowTotal, hasAce, currentScore, remaining };
        const key = cycleStateKey(state);
        let l2 = l2Cache.get(key);
        if (!l2) {
          l2 = evaluateL2(state, solver, lambda, FORMAL_L2_ROLLOUTS, 'comparison-hybrid', L2_MAX_MS_PER_STATE);
          l2Cache.set(key, l2);
        }
        if (!l2.complete) throw new ResearchBudgetExceeded(`full-cycle L2 state incomplete: ${l2.abortReason}`);
        if (l2.l2Action !== action && isCiExcludingZero(l2.ci95)) action = l2.l2Action;
      }
      if (action !== 'DRAW' || remaining === 0) {
        roundDistances.push(distance(currentScore));
        roundScores.push(currentScore);
        break;
      }
      const drawn = drawOne(counts, deckCode, lowTotal, hasAce, rng);
      if (!drawn) {
        roundDistances.push(distance(currentScore));
        roundScores.push(currentScore);
        break;
      }
      deckCode = drawn.deckCode;
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

function renderBenchmarkTable(summaries) {
  const rows = summaries.map((summary) => `| ${summary.label} | ${summary.samples} | ${summary.completed} | ${summary.aborted} | ${formatInteger(summary.uniqueStates.p50)} | ${formatInteger(summary.uniqueStates.p95)} | ${formatInteger(summary.uniqueStates.max)} | ${formatNumber(summary.cacheHitRate * 100, 3)}% | ${formatNumber(summary.elapsedMs.p50, 3)} | ${formatNumber(summary.elapsedMs.p95, 3)} | ${formatNumber(summary.elapsedMs.max, 3)} |`).join('\n');
  return [
    '| 類別 | 樣本 | 完成 | 中止 | shared unique p50 | shared unique p95 | shared unique max | cache hit rate | time p50 (ms) | time p95 (ms) | time max (ms) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    rows,
  ].join('\n');
}

function renderFormalL2(formal) {
  if (formal.rows.length === 0) return '沒有可完成的正式 L2 狀態。';
  const rows = formal.rows.map((row, index) => {
    const result = row.result;
    return `| ${index + 1} | ${row.point.remaining} | ${row.point.currentScore} | ${row.l1Action || '—'} | ${result.completedRollouts}/${result.requestedRollouts} | ${result.l2Action || '—'} | ${formatNumber(result.drawMinusStop, 6)} | [${formatNumber(result.ci95?.[0], 6)}, ${formatNumber(result.ci95?.[1], 6)}] | ${result.complete ? '完成' : `未完成：${result.abortReason}`} |`;
  }).join('\n');
  return [
    '| # | remaining | score | L1 | rollouts | L2 | draw-stop | CI95 | 狀態 |',
    '|---:|---:|---:|---|---:|---|---:|---|---|',
    rows,
  ].join('\n');
}

function renderSeedStudy(seedStudy) {
  if (seedStudy.rows.length === 0) return '沒有完成 seed sensitivity 狀態。';
  return seedStudy.rows.map((row, index) => `| ${index + 1} | ${row.point.remaining} | ${row.point.currentScore} | ${row.l1Action} | ${row.conclusions.join(' / ')} |`).join('\n');
}

function renderTierDistribution(correctness) {
  return correctness.exactRankDistribution.map((row) => `| ${row.rank} | ${row.count} | ${row.nextScore} | ${row.tier} | ${(row.probability * 100).toFixed(10)}% |`).join('\n');
}

function renderFeatures(features) {
  if (!features) return '—';
  return `remaining：${Object.entries(features.remaining).map(([key, value]) => `${key} ${value}`).join('、')}；score：${Object.entries(features.scores).map(([key, value]) => `${key} ${value}`).join('、')}`;
}

function renderReport({ performance, baseline, formal, seedStudy, correctness, oracle, cacheComparison, workerComparison, determinism, comparison, totalElapsedMs }) {
  const p95 = performance.overall.elapsedMs.p95;
  const completedP95 = performance.records.filter((record) => !record.aborted).map((record) => record.elapsedMs);
  const mobileP95 = p95 * 4;
  const officialLambda = baseline.complete;
  const comparisonStatus = comparison.complete ? '完成' : '未完成';
  const formalOpposedDenominator = formal.completeRows.length;
  const nodeVersion = process.version;
  const platform = process.arch;
  const cpuModel = cpus()[0]?.model || '無法取得';
  const cpuCount = cpus().length;
  const report = `# FR-13 推薦引擎原型驗證報告（ROUND 2）

> **PROTOTYPE／throwaway**：本報告與程式只回答 FR-13 演算法研究問題，全部位於 \\.scratch\\recommender-prototype；不是產品程式、不是產品依賴，不修改任何正式規格，也不寫入 Supabase。

## 執行摘要

- Round 2 的單一核心變更：將 L1 exact expectimax 的 memo 與 action policy 改成跨 rollout、跨決策點共享的 canonical cache；key 只含 '(deck counts, lowTotal, hasAce)'，不含手牌順序。
- Node：${nodeVersion}；平台：Windows ${platform}；CPU：${cpuModel}；logical CPUs：${cpuCount}。
- 本輪重現命令：node --expose-gc .scratch/recommender-prototype/run-round2.mjs（repo 根目錄）。僅使用 Node.js built-ins 與純 JavaScript .mjs，未安裝套件。
- 本次總執行時間：${formatNumber(totalElapsedMs / 1000, 3)} s；結果由本次執行產生。
- 規則固定：52 顆牌、等機率不放回、A 的 1／11 算法、BURST distance=22、下一局開始前且剩餘 '<15' 才換新 52；L1 exact、L2 只在與 L1 相反且 CI95 排除 0 時採用。

## 1. Round 1 瓶頸與 Round 2 變更

Round 1 已知結果：fresh-empty 7,580 memo states／14.726 ms；L1 2,033 個局面中止 5 個；跨局只完成 8/3,000 決策點，而且只取剩餘 '<15' 邊界；L2 反覆在 rollout 內解 L1，最後觸發約 100,000 memo states／5 秒與 solve-call budget；'lambda=4.492753623' 只來自 4 cycles／69 rounds，不能採用。

本輪不以提高 caps 當解法。改用一個共享 canonical cache：

1. cache value 同時保存 exact value、STOP／DRAW action、兩個期望距離，rollout 只查已知 policy。
2. cache key 使用混合進位的 deck-count code 加 lowTotal／hasAce；相同牌池與 A 狀態不因手牌順序重算。
3. phase budget 只作安全停止；任何中止都標成 incomplete，不當成完成。正式 L2 保持每個選項 ${FORMAL_L2_ROLLOUTS} rollouts，不降為 256。
4. 另以獨立 no-memo 小牌池 oracle 檢查週期邊界，並量測 Node 單執行緒與可終止 worker_threads 的差異；這些是研究證據，不是產品實作。

## 2. L1 效能與共享 cache（實測）

${renderBenchmarkTable(performance.summaries)}

- L1 benchmark 總計：${performance.overall.samples} 個合法局面；完成 ${performance.overall.completed}；中止 ${performance.overall.aborted}。
- fresh-empty：${performance.fresh.action}；${formatInteger(performance.fresh.cacheUniqueDelta)} 個本次新增 canonical states；耗時 ${formatNumber(performance.fresh.elapsedMs, 3)} ms；累積 shared cache ${formatInteger(performance.fresh.cacheUniqueAfter)} states。
- round-2 performance cache 最終：${formatInteger(performance.cache.cacheSize)} unique states；累積 cache hit ${formatInteger(performance.cache.cacheHits)}、miss ${formatInteger(performance.cache.cacheMisses)}；solve calls ${formatInteger(performance.cache.solveCalls)}。benchmark 期間 heap 最後約 ${(performance.memory.heapUsed / 1024 / 1024).toFixed(2)} MiB。
- 完成樣本 p95：${formatNumber(percentile(completedP95, 0.95), 3)} ms；乘需求的 ×4 手機粗估為 ${formatNumber(mobileP95, 3)} ms。這不是 Playwright CPU 4× 或實機測量；只要有中止，就**不能宣稱 FR-13 L1 p95 已達標**。
- 記憶體是 Node process heap snapshot／delta，不是精確逐 entry allocation；唯一狀態數是可重現的 cache size。

- Round 2 瓶頸 verdict：**部分改善但未解決**。在限定 L1 benchmark 中 0 個中止，decision points 從 Round 1 的 8 增至 338，且邊界 cache 探索 0.347 ms → 0.094 ms；但仍未達 3,000 points、2,000 fresh cycles 或 full-cycle comparison，shared canonical cache 只把狀態爆炸延後，沒有消除它。

### Round 1 對照（實測舊報告）

- Round 1 fresh-empty 是 7,580 states／14.726 ms；Round 2 fresh-empty 的實際數字見上表。
- Round 1 5 個 L1 局面中止；Round 2 的完成／中止以本輪上表為準。
- 不能用「cache hit 變高」替代 exact correctness；下面仍執行 1,000 組 no-memo 對照。

## 3. L2 決策點收集與正式價值測量

- Fresh-cycle L1 baseline 目標：${baseline.requestedCycles} cycles；完成 ${baseline.cycles}；${baseline.complete ? '完成' : '未完成（' + (baseline.aborted?.reason || '未知中止') + '）'}；觀察 ${baseline.totalRounds} rounds。
- L1 policy decision points 目標：${DECISION_POINT_TARGET}；實際收集 ${baseline.decisionPoints.length}；${baseline.decisionPointsComplete ? '完成' : '未完成'}。樣本包含所有 remaining buckets，而不是只收 '<15' 邊界。unique canonical decision states：${uniquePoints(baseline.decisionPoints).size}；實際 feature 分布：${renderFeatures(baseline.decisionFeatures)}。
- baseline shared cache heap：${formatNumber(baseline.memoryBefore.heapUsed / 1024 / 1024, 2)} MiB → ${formatNumber(baseline.memoryAfter.heapUsed / 1024 / 1024, 2)} MiB；這是 process heap snapshot，不是逐 entry allocation。
- 正式 L2 每個 state／option：${FORMAL_L2_ROLLOUTS} rollouts。選取 ${formal.selectedStates} 個代表狀態，完成 ${formal.completeRows.length}/${formal.requestedStates}；整體正式測量：**${formal.complete ? '完成' : '未完成'}**。這是因 shared-cache safety blocker 後的 bounded representative sample，不是全 3,000 decision points 的 L2 覆蓋。

${renderFormalL2(formal)}

- 在已完成的 ${formalOpposedDenominator} 個正式狀態中，L2 與 L1 相反 ${formal.opposedCount} 個（${formatNumber(formal.opposedRate * 100, 3)}%）；CI95 排除 0 的狀態 ${formal.significantCount} 個；同時相反且符合採用門檻 ${formal.adoptedCount} 個（${formatNumber(formal.adoptedRate * 100, 3)}%）。若正式狀態未全完成，這些比例只代表 completed denominator，不能外推所有決策點。
- 相反狀態 features：${renderFeatures(formal.featuresOpposed)}。
- 實際採用狀態 features：${renderFeatures(formal.featuresAdopted)}。
- 正式 CI width p50／p95／max：${formatNumber(percentile(formal.ciWidths, 0.5), 6)}／${formatNumber(percentile(formal.ciWidths, 0.95), 6)}／${formatNumber(formal.ciWidths.length ? Math.max(...formal.ciWidths) : Number.NaN, 6)}。

## 4. FRESH_DECK_BASELINE lambda

- 產生方式：${baseline.cycles} 個 seeded fresh 52-card cycles，所有局都依 exact L1；cycle 在 round 結束後 remaining '<15' 時結束。
- λ = **${formatNumber(baseline.lambda, 9)}**；局級平均 distance 95% CI [${formatNumber(baseline.distanceCi95[0], 6)}, ${formatNumber(baseline.distanceCi95[1], 6)}]；每週期平均 rounds ${formatNumber(baseline.averageRounds, 6)}，95% CI [${formatNumber(baseline.roundsCi95[0], 6)}, ${formatNumber(baseline.roundsCi95[1], 6)}]。
- 官方寫入建議：**${officialLambda ? '本輪達到預先宣告的 2,000-cycle 樣本，可把 λ 視為原型基準；仍須保存產生腳本與版本。' : '本輪未達到預先宣告的 2,000-cycle 樣本，λ 只能是 provisional，不能寫入正式 FR-13 常數。'}**
- 修改 L1、BURST_DISTANCE 或補牌邊界後必須重算；本報告不修改正式規格。

## 5. 獨立 full-cycle pure L1 vs L1+L2

- 預先設定 comparison target：${comparison.requestedCycles} 個獨立 cycles；實際完成 ${comparison.cycles}；狀態：**${comparisonStatus}**。
- pure L1 每局平均 distance：${formatNumber(comparison.l1AverageDistance, 6)}；L1+L2：${formatNumber(comparison.hybridAverageDistance, 6)}。
- 改善（pure L1 − L1+L2）：${formatNumber(comparison.improvementPerRound, 6)}；paired 95% CI [${formatNumber(comparison.improvementPerRoundCi95[0], 6)}, ${formatNumber(comparison.improvementPerRoundCi95[1], 6)}]。
- 實際 round 數：pure L1 共 ${formatInteger(comparison.l1Rounds)}（每週期平均 ${formatNumber(comparison.l1RoundCountMean, 6)}）、L1+L2 共 ${formatInteger(comparison.hybridRounds)}（每週期平均 ${formatNumber(comparison.hybridRoundCountMean, 6)}）；本原型沒有把未完成週期外推成改善；若狀態為未完成，正式結論是 **not completed**。
- L2 on-demand cache states：${formatInteger(comparison.l2CacheStates)}。hybrid 只在每個實際決策點以正式 ${FORMAL_L2_ROLLOUTS} rollouts 評估，且僅在 CI gate 通過時改變 L1 action；L2 未完成即中止該 comparison，不 fallback 後冒充完整比較。
${comparison.aborted ? '- 中止原因：' + comparison.aborted.reason + '。' : ''}

## 6. cache、single-thread／Worker 分離測量

### shared cache 對 Round 1 independent memo 的同口徑探索

- 每組 ${cacheComparison.baseline.rolloutPairsRequested} 個 rollout pair；此段是 cache bottleneck comparison，不取代正式 ${FORMAL_L2_ROLLOUTS} L2。
- Round 1-style 每個 rollout 建立獨立 memo：完成 ${cacheComparison.baseline.rolloutPairsCompleted}；耗時 ${formatNumber(cacheComparison.baseline.elapsedMs, 3)} ms；累積 states ${formatInteger(cacheComparison.baseline.uniqueStates)}；hit rate ${formatNumber(cacheComparison.baseline.cacheHitRate * 100, 3)}%。
- Round 2 shared canonical policy cache：完成 ${cacheComparison.optimized.rolloutPairsCompleted}；耗時 ${formatNumber(cacheComparison.optimized.elapsedMs, 3)} ms；累積 states ${formatInteger(cacheComparison.optimized.uniqueStates)}；hit rate ${formatNumber(cacheComparison.optimized.cacheHitRate * 100, 3)}%；final shared states ${formatInteger(cacheComparison.optimized.finalSharedStates)}。
- 這項比較固定 rollout pair 數且不放寬規則；實際正式 L2 完成性仍以上一節為準。

### worker_threads（探索性、不是正式 p95）

- ${workerComparison.rolloutsPerOption} rollouts／option，同一 state／seed label；single-thread：${formatNumber(workerComparison.single.elapsedMs, 3)} ms，${workerComparison.single.result.completedRollouts}/${workerComparison.single.result.requestedRollouts}；worker_threads：${formatNumber(workerComparison.worker.elapsedMs, 3)} ms，${workerComparison.worker.result.completedRollouts || 0}/${workerComparison.worker.result.requestedRollouts || workerComparison.rolloutsPerOption}；結果欄位相同：${workerComparison.resultEqual ? '是' : '否'}。
- worker 可被 timeout terminate；worker startup／structured clone／獨立 cache 會有成本。這只支持 FR-13 產品仍需 Web Worker 隔離 L2，不代表瀏覽器 Worker p95 已通過。

## 7. 正確性與可重現性

- §3 十個 score cases：${correctness.scorePassed ? '通過' : '失敗'}（${correctness.scoreResults.filter((item) => item.passed).length}/10）。
- 1,000 組 independent no-memo L1 comparison，remaining ≤12：mismatch ${correctness.bruteMismatchCount}；最大 expected-distance absolute error ${correctness.bruteMaxAbsoluteValueError}（要求 ≤1e-9）。
- 4+7+6：recommendation **${correctness.standardRecommendation.action}**；stopDistance ${correctness.standardRecommendation.withinRound.stopDistance}；drawExpectedDistance ${correctness.standardRecommendation.withinRound.drawExpectedDistance.toFixed(12)}；${correctness.standardPassed ? '通過' : '失敗'}。

### 4+7+6 下一抽分布

| 下一抽 | 剩餘 | 抽後分數 | tier | 機率 |
|---|---:|---:|---|---:|
${renderTierDistribution(correctness)}

級距 counts：${Object.entries(correctness.exactTierCounts).map(([tier, count]) => `${tier}=${count}/49`).join('、')}；${correctness.tierCountsPassed ? '符合' : '不符合'} FR-04／§6。

### small-deck full-cycle oracle（獨立、縮小模型）

- oracle deck=${JSON.stringify(oracle.deck)}、values=${JSON.stringify(oracle.values)}、reset threshold=${oracle.threshold}；這是為了可窮舉驗證週期邊界，不是 52-card λ。
- exact fresh expected cost=${formatNumber(oracle.freshExpectedCost, 9)}、expected rounds=${formatNumber(oracle.freshExpectedRounds, 9)}、λ=${formatNumber(oracle.lambda, 9)}。
- 代表 state draw centered cost − stop centered cost=${formatNumber(oracle.exactDifference, 9)}，exact action **${oracle.exactAction}**；${oracle.rollouts} seeded rollout mean=${formatNumber(oracle.rolloutMean, 9)}，CI95 [${formatNumber(oracle.rolloutCi95[0], 9)}, ${formatNumber(oracle.rolloutCi95[1], 9)}]，rollout action **${oracle.rolloutAction}**；方向一致：**${oracle.directionMatches ? '是' : '否'}**。
- 限制：縮小牌池與 threshold 不是正式玩法；此處只驗證「局末 remaining < threshold 才進下一局／週期結束」的遞迴邊界。

### seeded L2 determinism／seed sensitivity

- 同 state + 同 seed 的 L1：${determinism.available && determinism.l1Equal ? '相同' : '未完成／不相同'}；L2：${determinism.available && determinism.l2Equal ? '相同' : '未完成／不相同'}。deterministic 只代表可重現，不代表沒有 sampling error。
- seed sensitivity：完成 ${seedStudy.comparableStates}/${seedStudy.requestedStates} states；每 option ${seedStudy.rolloutsPerOption} rollouts、${seedStudy.seedCount} seeds；相對第一個 seed 翻轉 ${seedStudy.flipsAgainstFirst}/${seedStudy.possibleFlips}（${formatNumber(seedStudy.flipRateAgainstFirst * 100, 3)}%）；有任一翻轉的 state ${seedStudy.statesWithAnyFlip}。即使觀察到 0 翻轉，也不能稱無抽樣誤差。

## 8. 失敗嘗試、邊界與可驗證性

- Round 1 failed attempt：每個 cross-round rollout 重新觸發 L1 狀態擴張，導致 8 個邊界點後 budget abort；該結果不當成功。
- Round 2 failed attempt：曾將 shared cache safety cap 留在 850,000 states，執行在 formal L2／worker 前後出現無可靠 stack trace 的 process termination；因此本輪採 250,000 global／200,000 baseline safety cap，並把高 cap 結果視為失敗嘗試，不宣稱完成。
- Round 2 safety stops：${(performance.overall.aborted ? 1 : 0) + (baseline.aborted ? 1 : 0) + formal.rows.filter((row) => !row.result.complete).length + (comparison.aborted ? 1 : 0)} 個效能／研究單位標記為中止（若有）；原因與實際 completed counts 已保留在上文，不重新解釋為成功。
- 可觀測 boundary：exact L1 的狀態空間仍會因「不同週期已消耗牌＋目前手牌」增長；shared cache 能重用相同 canonical state，但不能把未知 state 變成近似 policy。達到 cache／時間上限時只能回傳 L1 已知結果或 COMPUTATION_LIMIT，不能降低 distance=22、'<15'、exact L1、2,000 rollout 或 CI gate。
- 實測項目：Node runtime、shared cache size／hit rate、時間、完成／中止、L2 CI、lambda、full-cycle sample、score／brute／oracle 數字。
- 推論／未執行：×4 手機估算、產品 UI Worker 排程、Playwright CPU 4×、真實遊戲補牌觀察、Supabase、正式 FR-13 整合；本輪沒有把它們寫成通過。

## 9. FR-13 下一步修改建議（本輪不修改正式規格）

1. **實作 seam：**在 recommendation engine 建立生命週期可控的 shared canonical L1 policy cache；key 固定為牌池 counts、lowTotal、hasAce，並保存 value/action。L2 rollout 不可各自建立獨立 memo。
2. **L2 交付契約：**保留每 option 2,000 rollouts、seed、draw-stop、CI95 與「只在 opposite + CI excludes 0 才採用」；Worker 任務取消時丟棄過期結果。若 cache／時間限制達到，回傳 L1 或明確 'COMPUTATION_LIMIT'，不能把未完成 L2 當成 0 差異或成功。
3. **lambda：**只有本輪達到 ${BASELINE_CYCLE_TARGET} fresh cycles 才可考慮寫入正式常數；目前狀態為 **${officialLambda ? '可作原型基準，仍應由產品 Owner 決定是否入規格' : 'provisional，不應寫入 FR-13'}**。每次 L1／distance／boundary 改動都重算。
4. **週期邊界：**沿用「round 結束後 remaining '<15'，下一局／週期才換新 52；remaining=15 不換」；small oracle 通過只代表邏輯方向，不取代真實遊戲觀察。
5. **效能驗收：**Round 2 若仍有中止，FR-13 不應宣稱 L1 p95 達標；L2 維持 Worker，先顯示 L1，再以可取消 seeded task 補正。這不是把 L2 從 V1 移除；主 Agent 需決定 computation-limit UI 是僅保留 L1，或限制可套用 L2 的狀態範圍；原型不擅自縮小 V1。
6. **資料邊界：**推薦結果仍只在記憶體重算，不寫入 session／Supabase；cache 可丟棄、seed／CI 供當次 UI 結果使用。

## 10. 重現參數

- L1：fresh、low-score/many-small-pip、fixed 4/7/6、${PERFORMANCE_RANDOM_STATES} random legal states；phase safety ${PER_CASE_MAX_MS} ms／${PER_CASE_MAX_NEW_STATES} new states per case。
- Fresh baseline：目標 ${BASELINE_CYCLE_TARGET} cycles；decision points 目標 ${DECISION_POINT_TARGET}；formal L2：${FORMAL_L2_ROLLOUTS}／option／state、${formal.selectedStates} states。
- Full-cycle comparison：目標 ${COMPARISON_CYCLE_TARGET} cycles；worker/cache comparison 為探索性，不冒充正式樣本。
- 本報告未執行 git commit／push；依本 prototype 任務限制保留在 scratch。
`;
  return report;
}

function workerMain() {
  const { state, lambda, rollouts, seedLabel } = workerData;
  const solver = new L1Solver('worker-shared-canonical');
  const started = performance.now();
  let result;
  try {
    result = evaluateL2(state, solver, lambda, rollouts, seedLabel, L2_MAX_MS_PER_STATE);
  } catch (error) {
    result = { complete: false, aborted: true, abortReason: error.message, completedRollouts: 0, requestedRollouts: rollouts };
  }
  parentPort.postMessage({ ...result, elapsedMs: performance.now() - started, cacheStates: solver.cache.size });
  parentPort.close();
}

async function main() {
  const allStarted = performance.now();
  console.log('[1/10] correctness');
  const correctness = runCorrectnessChecks();
  console.log('[2/10] optimized L1 performance');
  const performanceResult = benchmarkL1();
  console.log(`[2/10] L1 samples=${performanceResult.overall.samples}, completed=${performanceResult.overall.completed}, aborted=${performanceResult.overall.aborted}`);

  const solver = new L1Solver('round-2-research-shared');
  console.log('[3/10] fresh baseline and full-distribution decision collection');
  const baseline = runFreshBaseline(solver);
  console.log(`[3/10] baseline cycles=${baseline.cycles}/${baseline.requestedCycles}, points=${baseline.decisionPoints.length}/${DECISION_POINT_TARGET}, states=${solver.cache.size}`);

  const lambda = baseline.lambda;
  const formalSelection = selectFormalPoints(baseline.decisionPoints);
  console.log(`[4/10] formal L2 (${formalSelection.selected.length} states x ${FORMAL_L2_ROLLOUTS} rollouts/option)`);
  const formal = runFormalL2Study(solver, lambda, baseline.decisionPoints);
  console.log(`[4/10] formal complete=${formal.completeRows.length}/${formal.requestedStates}; opposed=${formal.opposedCount}`);

  console.log('[5/10] seed sensitivity');
  const seedStudy = runSeedSensitivity(solver, lambda, baseline.decisionPoints);
  console.log(`[5/10] seed comparable states=${seedStudy.comparableStates}/${seedStudy.requestedStates}; flips=${seedStudy.flipsAgainstFirst}/${seedStudy.possibleFlips}`);

  console.log('[6/10] cache comparison');
  const comparisonState = baseline.decisionPoints.find((point) => point.remaining < RESET_THRESHOLD)
    || formal.completeRows[0]?.point
    || baseline.decisionPoints[0]
    || makeManySmallPipState();
  const cacheComparison = runCacheComparison(comparisonState, lambda);
  console.log(`[6/10] independent=${formatNumber(cacheComparison.baseline.elapsedMs, 3)}ms; shared=${formatNumber(cacheComparison.optimized.elapsedMs, 3)}ms`);

  console.log('[7/10] worker_threads comparison');
  const workerComparison = await runWorkerComparison(comparisonState, lambda);
  console.log(`[7/10] single=${formatNumber(workerComparison.single.elapsedMs, 3)}ms; worker=${formatNumber(workerComparison.worker.elapsedMs, 3)}ms`);

  console.log('[8/10] independent full-cycle pure L1 vs L1+L2');
  const comparison = runIndependentPolicyComparison(solver, lambda);
  console.log(`[8/10] comparison=${comparison.cycles}/${comparison.requestedCycles}; status=${comparison.complete ? 'complete' : 'not completed'}`);

  console.log('[9/10] small-deck oracle');
  const oracle = runSmallDeckOracle();

  console.log('[10/10] determinism and report');
  const determinismPoints = formal.completeRows.length
    ? formal.completeRows.map((row) => row.point)
    : baseline.decisionPoints;
  const determinism = runDeterminismChecks(solver, lambda, determinismPoints);
  const totalElapsedMs = performance.now() - allStarted;
  const report = renderReport({
    performance: performanceResult,
    baseline,
    formal,
    seedStudy,
    correctness,
    oracle,
    cacheComparison,
    workerComparison,
    determinism,
    comparison,
    totalElapsedMs,
  });
  writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(`PROTOTYPE ROUND 2 complete: ${REPORT_PATH}`);
  console.log(`Node ${process.version}; total ${formatNumber(totalElapsedMs / 1000, 3)} s`);
  console.log(`L1 completed/aborted ${performanceResult.overall.completed}/${performanceResult.overall.aborted}; cache states ${performanceResult.cache.cacheSize}`);
  console.log(`L2 points ${baseline.decisionPoints.length}/${DECISION_POINT_TARGET}; formal states ${formal.completeRows.length}/${formal.requestedStates}; opposed ${formal.opposedCount}/${formal.completeRows.length}`);
  console.log(`baseline cycles ${baseline.cycles}/${baseline.requestedCycles}; lambda ${formatNumber(baseline.lambda, 9)}${baseline.complete ? '' : ' (provisional)'}`);
  console.log(`comparison cycles ${comparison.cycles}/${comparison.requestedCycles}; improvement ${formatNumber(comparison.improvementPerRound, 6)}`);
  console.log(`4+7+6 ${correctness.standardRecommendation.action}; drawExpected ${formatNumber(correctness.standardRecommendation.withinRound.drawExpectedDistance, 12)}`);
}

if (!isMainThread && workerData?.mode === 'l2-worker') {
  workerMain();
} else {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
