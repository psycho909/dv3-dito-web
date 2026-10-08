// PROTOTYPE — ROUND 3 exact L1 fresh-cycle baseline and targeted-point collection.
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  INITIAL_DECK,
  RESET_THRESHOLD,
  RoundL1Solver,
  ci95,
  cloneDeck,
  formatNumber,
  makeDeckOrder,
  mean,
  percentile,
  serializePoint,
  simulateCycleL1,
  sum,
} from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const RESULT_PATH = join(DIR, process.env.R3_LAMBDA_RESULT || 'r3-lambda.json');
const TARGET_CYCLES = Number(process.env.R3_LAMBDA_CYCLES || 2000);
const START_CYCLE = Number(process.env.R3_LAMBDA_START || 0);
const END_CYCLE = Number(process.env.R3_LAMBDA_END || TARGET_CYCLES);
const TARGETED_POINT_TARGET = Number(process.env.R3_TARGETED_POINTS || 800);
const CALIBRATION_POINT_TARGET = Number(process.env.R3_CALIBRATION_POINTS || 10000);
const MAX_RUNTIME_MS = Number(process.env.R3_LAMBDA_MAX_MS || 12 * 60 * 1000);

function main() {
  const started = performance.now();
  const solver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
  const allDistances = [];
  const cycleAverages = [];
  const roundsPerCycle = [];
  const cycleElapsedMs = [];
  const maxCacheStatesPerCycle = [];
  let peakHeapUsed = 0;
  const calibrationPoints = [];
  const targetedPoints = [];
  let completedCycles = 0;
  let aborted = null;

  console.log(`[R3-B] exact L1 baseline target=${TARGET_CYCLES} cycles; per-round cache`);
  for (let cycle = START_CYCLE; cycle < Math.min(TARGET_CYCLES, END_CYCLE); cycle += 1) {
    if (process.env.R3_VERBOSE === '1') console.log(`  begin cycle=${cycle}`);
    if (performance.now() - started > MAX_RUNTIME_MS) {
      aborted = {
        reason: `runtime>${MAX_RUNTIME_MS}ms`,
        completedCycles,
      };
      break;
    }
    const cycleStarted = performance.now();
    const cycleLabel = `r3-lambda-${cycle}`;
    try {
      const result = simulateCycleL1({
        solver,
        seedLabel: cycleLabel,
        cardOrder: makeDeckOrder(cycleLabel),
        onDecision: (point) => {
          if (calibrationPoints.length < CALIBRATION_POINT_TARGET) calibrationPoints.push(serializePoint(point));
          const gap = Math.abs(point.l1.drawExpectedDistance - point.l1.stopDistance);
          if (targetedPoints.length < TARGETED_POINT_TARGET
            && (gap < 1 || (point.remaining >= 15 && point.remaining <= 20))) {
            targetedPoints.push(serializePoint(point));
          }
        },
      });
      allDistances.push(...result.roundDistances);
      cycleAverages.push(result.averageDistance);
      roundsPerCycle.push(result.roundCount);
      maxCacheStatesPerCycle.push(Math.max(...result.roundMetrics.map((metric) => metric.cacheStates)));
      cycleElapsedMs.push(performance.now() - cycleStarted);
      completedCycles += 1;
      // Round metrics are evidence for this cycle; avoid retaining every round forever.
      solver.roundMetrics.length = 0;
      if (typeof global.gc === 'function' && (cycle + 1) % 10 === 0) global.gc();
      const heapUsed = process.memoryUsage().heapUsed;
      peakHeapUsed = Math.max(peakHeapUsed, heapUsed);
      if ((cycle + 1) % 100 === 0 || cycle + 1 === TARGET_CYCLES) {
        console.log(`  cycles=${cycle + 1}/${TARGET_CYCLES}; rounds=${allDistances.length}; targeted=${targetedPoints.length}; calibration=${calibrationPoints.length}; heap=${(heapUsed / 1024 / 1024).toFixed(2)}MiB`);
      }
    } catch (error) {
      aborted = {
        reason: error.message,
        name: error.name,
        elapsedMs: error.elapsedMs,
        newStates: error.newStates,
        solveCalls: error.solveCalls,
        completedCycles,
      };
      break;
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model || 'unknown',
    logicalCpus: cpus().length,
    command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-lambda.mjs',
    rules: {
      initialDeck: INITIAL_DECK,
      burstDistance: 22,
      resetThreshold: RESET_THRESHOLD,
      resetTiming: 'after round ends; next round starts fresh only when remaining<15',
      l1: 'exact expectimax; cache cleared at every round end',
      cycleSeed: 'r3-lambda-{cycle}; Fisher-Yates uniform deck order',
    },
    requestedCycles: TARGET_CYCLES,
    completedCycles,
    complete: !aborted && completedCycles === TARGET_CYCLES,
    aborted,
    lambda: mean(allDistances),
    distanceCi95: ci95(allDistances),
    cycleAverageDistance: mean(cycleAverages),
    cycleAverageDistanceCi95: ci95(cycleAverages),
    averageRounds: mean(roundsPerCycle),
    roundsCi95: ci95(roundsPerCycle),
    totalRounds: allDistances.length,
    distanceValues: allDistances,
    cycleAverages,
    roundsPerCycle,
    totalElapsedMs: performance.now() - started,
    cycleElapsedMs: {
      p50: percentile(cycleElapsedMs, 0.5),
      p95: percentile(cycleElapsedMs, 0.95),
      max: cycleElapsedMs.length ? Math.max(...cycleElapsedMs) : Number.NaN,
    },
    perRoundCache: {
      maxStatesP50: percentile(maxCacheStatesPerCycle, 0.5),
      maxStatesP95: percentile(maxCacheStatesPerCycle, 0.95),
      maxStatesMax: maxCacheStatesPerCycle.length ? Math.max(...maxCacheStatesPerCycle) : Number.NaN,
    },
    peakHeapUsedBytes: peakHeapUsed,
    targetedPointTarget: TARGETED_POINT_TARGET,
    targetedPoints,
    calibrationPointTarget: CALIBRATION_POINT_TARGET,
    calibrationPoints,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[R3-B] cycles=${completedCycles}/${TARGET_CYCLES}; lambda=${formatNumber(result.lambda, 9)}; rounds=${result.totalRounds}`);
  console.log(`[R3-B] targeted=${targetedPoints.length}/${TARGETED_POINT_TARGET}; elapsed=${formatNumber(result.totalElapsedMs / 1000, 3)}s`);
  console.log(`[R3-B] wrote ${RESULT_PATH}`);
}

main();
