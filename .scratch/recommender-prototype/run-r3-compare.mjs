// PROTOTYPE — ROUND 3 paired full-cycle pure L1 versus L1+L2.
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  RoundL1Solver,
  cloneDeck,
  ci95,
  deckTotal,
  drawFromOrder,
  encodeDeck,
  evaluateL2,
  formatNumber,
  isCiExcludingZero,
  isTerminalScore,
  makeDeckOrder,
  mean,
  policyFromDefinition,
  scoreState,
  simulateCycleL1,
  stateKey,
  distance,
} from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const L2_PATH = join(DIR, 'r3-l2.json');
const RESULT_PATH = join(DIR, process.env.R3_COMPARE_RESULT || 'r3-compare.json');
const TARGET_CYCLES = Number(process.env.R3_COMPARE_CYCLES || 200);
const START_CYCLE = Number(process.env.R3_COMPARE_START || 0);
const END_CYCLE = Number(process.env.R3_COMPARE_END || TARGET_CYCLES);
const MAX_RUNTIME_MS = Number(process.env.R3_COMPARE_MAX_MS || 12 * 60 * 1000);
const MAX_ROLLOUTS = 2000;
const MIN_ROLLOUTS_FOR_STOP = 30;

function readL2() {
  try {
    return JSON.parse(readFileSync(L2_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`找不到 ${L2_PATH}；請先執行 run-r3-l2.mjs：${error.message}`);
  }
}

function compactL2(result) {
  const { rawDifferenceSample, ...compact } = result;
  return compact;
}

function simulateCycleWithL2({ solver, policy, lambda, order, l2Cache, stats }) {
  const counts = cloneDeck([4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
  let deckCode = encodeDeck(counts);
  let cursor = 0;
  let lowTotal = 0;
  let hasAce = false;
  const roundDistances = [];
  const roundScores = [];

  while (true) {
    solver.beginRound();
    try {
      while (true) {
        const currentScore = scoreState(lowTotal, hasAce);
        const remaining = deckTotal(counts);
        const l1 = solver.decision(counts, lowTotal, hasAce, deckCode);
        let action = l1.action;
        if (currentScore > 0 && currentScore < 21 && remaining > 0) {
          stats.l1DecisionPoints += 1;
          const state = {
            counts: cloneDeck(counts),
            deckCode,
            lowTotal,
            hasAce,
            currentScore,
            remaining,
            l1,
          };
          const key = stateKey(counts, lowTotal, hasAce);
          let l2 = l2Cache.get(key);
          if (!l2) {
            const evaluated = evaluateL2({
              state,
              policy,
              lambda,
              maxRollouts: MAX_ROLLOUTS,
              seedLabel: 'r3-full-cycle',
              commonRandomNumbers: true,
              sequential: true,
              minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
            });
            l2 = compactL2(evaluated);
            l2Cache.set(key, l2);
            stats.l2EvaluatedStates += 1;
            if (!l2.complete) stats.l2Incomplete += 1;
          } else {
            stats.l2CacheHits += 1;
          }
          if (l2.complete && l2.l2Action !== action && isCiExcludingZero(l2.ci95)) {
            action = l2.l2Action;
            stats.adoptedDecisions += 1;
          }
        }
        if (action !== 'DRAW' || remaining === 0) {
          roundDistances.push(distance(currentScore));
          roundScores.push(currentScore);
          break;
        }
        const drawn = drawFromOrder(order, cursor, counts, lowTotal, hasAce);
        if (!drawn) {
          roundDistances.push(distance(currentScore));
          roundScores.push(currentScore);
          break;
        }
        cursor = drawn.cursor;
        deckCode -= [1, 5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125][drawn.index];
        lowTotal = drawn.lowTotal;
        hasAce = drawn.hasAce;
      }
    } finally {
      if (solver.active) solver.endRound();
    }
    if (deckTotal(counts) < 15) break;
    lowTotal = 0;
    hasAce = false;
  }
  return {
    roundDistances,
    roundScores,
    roundCount: roundDistances.length,
    totalDistance: roundDistances.reduce((total, value) => total + value, 0),
    averageDistance: mean(roundDistances),
    remainingAtEnd: deckTotal(counts),
  };
}

function main() {
  const l2 = readL2();
  const policy = policyFromDefinition(l2.selectedDefinition);
  const started = performance.now();
  const pureSolver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
  const hybridSolver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
  const l2Cache = new Map();
  const stats = {
    l1DecisionPoints: 0,
    l2EvaluatedStates: 0,
    l2CacheHits: 0,
    l2Incomplete: 0,
    adoptedDecisions: 0,
  };
  const pureAverages = [];
  const hybridAverages = [];
  const pureRounds = [];
  const hybridRounds = [];
  const pureDistances = [];
  const hybridDistances = [];
  const pairedImprovement = [];
  let completedCycles = 0;
  let aborted = null;

  console.log(`[R3-G] paired full-cycle target=${TARGET_CYCLES}; range=${START_CYCLE}-${Math.min(TARGET_CYCLES, END_CYCLE)}; strategy=${l2.selectedStrategy}; L2 max=${MAX_ROLLOUTS}/option`);
  for (let index = START_CYCLE; index < Math.min(TARGET_CYCLES, END_CYCLE); index += 1) {
    if (performance.now() - started > MAX_RUNTIME_MS) {
      aborted = { reason: `runtime>${MAX_RUNTIME_MS}ms`, completedCycles };
      break;
    }
    const label = `r3-compare-${index}`;
    const order = makeDeckOrder(label);
    try {
      const pure = simulateCycleL1({ solver: pureSolver, seedLabel: label, cardOrder: order });
      const hybrid = simulateCycleWithL2({
        solver: hybridSolver,
        policy,
        lambda: l2.baseline.lambda,
        order,
        l2Cache,
        stats,
      });
      pureAverages.push(pure.averageDistance);
      hybridAverages.push(hybrid.averageDistance);
      pureRounds.push(pure.roundCount);
      hybridRounds.push(hybrid.roundCount);
      pureDistances.push(...pure.roundDistances);
      hybridDistances.push(...hybrid.roundDistances);
      pairedImprovement.push(pure.averageDistance - hybrid.averageDistance);
      completedCycles += 1;
      pureSolver.roundMetrics.length = 0;
      hybridSolver.roundMetrics.length = 0;
      if ((index + 1) % 10 === 0 || index + 1 === TARGET_CYCLES) {
        console.log(`  cycles=${index + 1}/${TARGET_CYCLES}; L2 states=${l2Cache.size}; adopted=${stats.adoptedDecisions}; incomplete=${stats.l2Incomplete}`);
      }
    } catch (error) {
      aborted = { reason: error.message, name: error.name, completedCycles };
      break;
    }
  }

  const improvementCi = ci95(pairedImprovement);
  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model || 'unknown',
    logicalCpus: cpus().length,
    command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-compare.mjs',
    requestedCycles: TARGET_CYCLES,
    cycleStart: START_CYCLE,
    cycleEnd: Math.min(TARGET_CYCLES, END_CYCLE),
    completedCycles,
    complete: !aborted && completedCycles === Math.max(0, Math.min(TARGET_CYCLES, END_CYCLE) - START_CYCLE) && stats.l2Incomplete === 0,
    aborted,
    selectedStrategy: l2.selectedStrategy,
    lambda: l2.baseline.lambda,
    pureL1: {
      averageDistance: mean(pureDistances),
      cycleAverageDistance: mean(pureAverages),
      averageRoundsPerCycle: mean(pureRounds),
      totalRounds: pureDistances.length,
      cycleAverageCi95: ci95(pureAverages),
      cycleAverages: pureAverages,
      roundCounts: pureRounds,
      distanceValues: pureDistances,
    },
    hybridL1L2: {
      averageDistance: mean(hybridDistances),
      cycleAverageDistance: mean(hybridAverages),
      averageRoundsPerCycle: mean(hybridRounds),
      totalRounds: hybridDistances.length,
      cycleAverageCi95: ci95(hybridAverages),
      cycleAverages: hybridAverages,
      roundCounts: hybridRounds,
      distanceValues: hybridDistances,
    },
    pairedImprovementPureMinusHybrid: {
      mean: mean(pairedImprovement),
      ci95: improvementCi,
      significant: isCiExcludingZero(improvementCi) && improvementCi[0] > 0,
      samples: pairedImprovement.length,
      values: pairedImprovement,
    },
    stats: {
      ...stats,
      l2CacheStates: l2Cache.size,
    },
    totalElapsedMs: performance.now() - started,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[R3-G] cycles=${completedCycles}/${TARGET_CYCLES}; pure=${formatNumber(result.pureL1.averageDistance, 6)}; hybrid=${formatNumber(result.hybridL1L2.averageDistance, 6)}`);
  console.log(`[R3-G] improvement=${formatNumber(result.pairedImprovementPureMinusHybrid.mean, 6)}; CI=[${formatNumber(improvementCi[0], 6)}, ${formatNumber(improvementCi[1], 6)}]; significant=${result.pairedImprovementPureMinusHybrid.significant}`);
  console.log(`[R3-G] wrote ${RESULT_PATH}; elapsed=${formatNumber(result.totalElapsedMs / 1000, 3)}s`);
}

main();
