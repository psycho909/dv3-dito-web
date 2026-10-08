// PROTOTYPE — ROUND 3 L1 benchmark and correctness checks.
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  INITIAL_DECK,
  RANKS,
  SCORE_CASES,
  RoundL1Solver,
  cloneDeck,
  deckAfterHand,
  deckTotal,
  exactNextDraw,
  formatNumber,
  handState,
  makeRandomLegalState,
  rngFor,
  score,
  bruteSolve,
  percentile,
  mean,
  distance,
} from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const RESULT_PATH = join(DIR, 'r3-l1.json');
const BENCHMARK_RANDOM_STATES = 1000;
const BENCHMARK_LOW_STATES = 20;
const BENCHMARK_SMALL_STATES = 20;
const BENCHMARK_FIXED_STATES = 5;
const NO_MEMO_CASES = 1000;

function gcIfAvailable() {
  if (typeof global.gc === 'function') global.gc();
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return { heapUsed: usage.heapUsed, rss: usage.rss };
}

function benchmarkOne(label, state, solveRoot = true) {
  const solver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
  const beforeMemory = memorySnapshot();
  const started = performance.now();
  let result = null;
  let aborted = null;
  solver.beginRound();
  try {
    result = solveRoot
      ? solver.solve(cloneDeck(state.counts), state.lowTotal, state.hasAce, state.deckCode)
      : solver.decision(cloneDeck(state.counts), state.lowTotal, state.hasAce, state.deckCode);
  } catch (error) {
    aborted = {
      name: error.name,
      reason: error.message,
      elapsedMs: error.elapsedMs,
      newStates: error.newStates,
      solveCalls: error.solveCalls,
    };
  }
  const metric = solver.active ? solver.endRound() : null;
  const elapsedMs = performance.now() - started;
  const afterMemory = memorySnapshot();
  return {
    label,
    hand: state.hand || null,
    remaining: deckTotal(state.counts),
    score: state.currentScore ?? handState(state.hand || []).currentScore,
    action: result?.action || 'ABORTED',
    result,
    aborted,
    elapsedMs,
    cacheStates: metric?.cacheStates ?? 0,
    cacheHits: metric?.cacheHits ?? 0,
    cacheMisses: metric?.cacheMisses ?? 0,
    solveCalls: metric?.solveCalls ?? 0,
    heapBefore: beforeMemory.heapUsed,
    heapAfter: afterMemory.heapUsed,
    heapDelta: afterMemory.heapUsed - beforeMemory.heapUsed,
  };
}

function randomBenchmarkState(rng, maxRemaining = 4) {
  const state = makeRandomLegalState(rng, maxRemaining);
  return { ...state, hand: state.hand };
}

function summarizeRecords(records) {
  const elapsed = records.map((row) => row.elapsedMs);
  const cache = records.map((row) => row.cacheStates);
  const completed = records.filter((row) => !row.aborted);
  return {
    samples: records.length,
    completed: completed.length,
    aborted: records.length - completed.length,
    elapsedMs: {
      p50: percentile(elapsed, 0.5),
      p95: percentile(elapsed, 0.95),
      max: Math.max(...elapsed),
    },
    cacheStates: {
      p50: percentile(cache, 0.5),
      p95: percentile(cache, 0.95),
      max: Math.max(...cache),
    },
    heapDeltaBytes: {
      p50: percentile(records.map((row) => row.heapDelta), 0.5),
      max: Math.max(...records.map((row) => row.heapDelta)),
    },
  };
}

function benchmarkL1() {
  const records = [];
  const lowRng = rngFor('r3-l1-low');
  const randomRng = rngFor('r3-l1-random');
  const fixedHand = ['4', '7', '6'];
  const fixed = { ...deckAfterHand(fixedHand), ...handState(fixedHand), hand: fixedHand };
  records.push(benchmarkOne('fresh-empty', {
    hand: [], counts: cloneDeck(INITIAL_DECK), deckCode: encodeDeckForLocal(INITIAL_DECK),
    lowTotal: 0, hasAce: false, currentScore: 0,
  }));
  for (let index = 0; index < BENCHMARK_LOW_STATES; index += 1) {
    const hand = [['2'], ['3'], ['4'], ['A']][lowRng.nextInt(4)];
    const state = { ...deckAfterHand(hand), ...handState(hand), hand };
    records.push(benchmarkOne('low-score', state));
  }
  const manySmallCounts = [4, 3, 4, 4, 4, 4, 4, 4, 4, 0];
  const manySmallState = {
    hand: ['2'],
    counts: manySmallCounts,
    deckCode: encodeDeckForLocal(manySmallCounts),
    ...handState(['2']),
  };
  for (let index = 0; index < BENCHMARK_SMALL_STATES; index += 1) {
    records.push(benchmarkOne('small-heavy', manySmallState));
  }
  for (let index = 0; index < BENCHMARK_FIXED_STATES; index += 1) records.push(benchmarkOne('fixed-4-7-6', fixed));
  for (let index = 0; index < BENCHMARK_RANDOM_STATES; index += 1) {
    records.push(benchmarkOne('random-legal', randomBenchmarkState(randomRng, 4)));
  }
  const grouped = new Map();
  for (const row of records) {
    if (!grouped.has(row.label)) grouped.set(row.label, []);
    grouped.get(row.label).push(row);
  }
  const summaries = Object.fromEntries([...grouped.entries()].map(([label, rows]) => [label, summarizeRecords(rows)]));
  return {
    records,
    summaries,
    overall: summarizeRecords(records),
    fresh: records[0],
    maxRoundCacheStates: Math.max(...records.map((row) => row.cacheStates)),
    maxHeapDeltaBytes: Math.max(...records.map((row) => row.heapDelta)),
  };
}

// Avoid importing a second encoding table into the benchmark's public result.
function encodeDeckForLocal(counts) {
  let code = 0;
  let stride = 1;
  for (let index = 0; index < counts.length; index += 1) {
    code += counts[index] * stride;
    stride *= index === 9 ? 17 : 5;
  }
  return code;
}

function runNoMemoComparison() {
  const rng = rngFor('r3-no-memo-1000');
  let mismatchCount = 0;
  let maxValueError = 0;
  let maxActionMismatch = null;
  const started = performance.now();
  for (let index = 0; index < NO_MEMO_CASES; index += 1) {
    const state = makeRandomLegalState(rng, 12);
    const solver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
    solver.beginRound();
    const memo = solver.solve(cloneDeck(state.counts), state.lowTotal, state.hasAce, state.deckCode);
    solver.endRound();
    const brute = bruteSolve(cloneDeck(state.counts), state.lowTotal, state.hasAce);
    const valueError = Math.abs(memo.value - brute.value);
    maxValueError = Math.max(maxValueError, valueError);
    if (memo.action !== brute.action || valueError > 1e-9) {
      mismatchCount += 1;
      if (!maxActionMismatch) maxActionMismatch = { index, state, memo, brute, valueError };
    }
  }
  return {
    requested: NO_MEMO_CASES,
    completed: NO_MEMO_CASES,
    mismatchCount,
    maxValueError,
    firstMismatch: maxActionMismatch,
    elapsedMs: performance.now() - started,
    tolerance: 1e-9,
  };
}

function runScoreChecks() {
  const rows = SCORE_CASES.map((testCase) => {
    const actual = score(testCase.hand);
    return { ...testCase, actual, passed: actual === testCase.expected };
  });
  return { rows, passed: rows.every((row) => row.passed) };
}

function runStandardCase() {
  const hand = ['4', '7', '6'];
  const deck = deckAfterHand(hand);
  const state = handState(hand);
  const solver = new RoundL1Solver();
  solver.beginRound();
  const result = solver.decision(deck.counts, state.lowTotal, state.hasAce, deck.deckCode);
  const metric = solver.endRound();
  const distribution = exactNextDraw(hand, deck.counts);
  const expectedTierCounts = { PERFECT: 3, GREAT: 8, GOOD: 4, NORMAL: 0, BURST: 34 };
  const passed = result.action === 'STOP'
    && result.stopDistance === 4
    && Math.abs(result.drawExpectedDistance - 15.755102040816) <= 1e-9
    && JSON.stringify(distribution.tierCounts) === JSON.stringify(expectedTierCounts);
  return {
    hand,
    remaining: deckTotal(deck.counts),
    recommendation: result,
    stopDistance: result.stopDistance,
    drawExpectedDistance: result.drawExpectedDistance,
    distribution,
    tierCountsExpected: expectedTierCounts,
    cacheMetric: metric,
    passed,
  };
}

function main() {
  const started = performance.now();
  console.log('[R3-A] L1 benchmark: per-round cache');
  const benchmark = benchmarkL1();
  console.log(`[R3-A] cases=${benchmark.overall.samples}; completed=${benchmark.overall.completed}; aborted=${benchmark.overall.aborted}; maxCache=${benchmark.maxRoundCacheStates}`);
  console.log('[R3-A] independent no-memo comparison');
  const noMemo = runNoMemoComparison();
  console.log(`[R3-A] no-memo mismatches=${noMemo.mismatchCount}/${noMemo.completed}; maxError=${formatNumber(noMemo.maxValueError, 12)}`);
  const scoreChecks = runScoreChecks();
  const standard = runStandardCase();
  console.log(`[R3-A] score=${scoreChecks.passed ? 'PASS' : 'FAIL'}; 4+7+6=${standard.recommendation.action}; draw=${formatNumber(standard.drawExpectedDistance, 12)}`);
  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model || 'unknown',
    logicalCpus: cpus().length,
    command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-l1.mjs',
    rules: {
      deck: INITIAL_DECK,
      burstDistance: 22,
      resetThreshold: 15,
      cacheScope: 'one round; cleared at round end',
      l1: 'exact expectimax',
    },
    benchmark,
    noMemo,
    scoreChecks,
    standard,
    totalElapsedMs: performance.now() - started,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[R3-A] wrote ${RESULT_PATH}`);
}

main();
