// PROTOTYPE — ROUND 3 approximate L2 strategy, CRN, sequential stopping, and targeted study.
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  RoundL1Solver,
  buildCompositionDefinition,
  buildFixedThresholdDefinition,
  ci95,
  evaluateL2,
  formatNumber,
  isCiExcludingZero,
  isSoftState,
  makeDeckOrder,
  mean,
  percentile,
  policyFromDefinition,
  remainingBucket,
  simulateCycleApprox,
  simulateCycleL1,
  strategyFallbackRate,
  summarizeTimes,
  tenRatioBucket,
} from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(DIR, 'r3-lambda.json');
const RESULT_PATH = join(DIR, 'r3-l2.json');
const STRATEGY_CYCLES = Number(process.env.R3_STRATEGY_CYCLES || 300);
const MAX_ROLLOUTS = 2000;
const MIN_ROLLOUTS_FOR_STOP = 30;
const TARGETED_EVAL_LIMIT = 500;
const CRN_STATE_COUNT = Number(process.env.R3_CRN_STATES || 5);
const SEQUENTIAL_STATE_COUNT = Number(process.env.R3_SEQUENTIAL_STATES || 30);
const TIMING_STATE_COUNT = Number(process.env.R3_TIMING_STATES || 30);

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`找不到 ${BASELINE_PATH}；請先執行 run-r3-lambda.mjs：${error.message}`);
  }
}

function compactL2(result) {
  const { rawDifferenceSample, ...compact } = result;
  return compact;
}

function featureBucket(point) {
  return {
    remaining: remainingBucket(point.remaining),
    score: point.currentScore <= 8 ? '1–8'
      : point.currentScore <= 12 ? '9–12'
        : point.currentScore <= 15 ? '13–15'
          : point.currentScore <= 18 ? '16–18' : '19–20',
    softHard: isSoftState(point.lowTotal, point.hasAce) ? 'soft' : 'hard',
  };
}

function featureCounts(rows) {
  const remainingKeys = ['<15', '15–19', '20–29', '30–39', '≥40'];
  const scoreKeys = ['1–8', '9–12', '13–15', '16–18', '19–20'];
  const result = {
    remaining: Object.fromEntries(remainingKeys.map((key) => [key, 0])),
    score: Object.fromEntries(scoreKeys.map((key) => [key, 0])),
    softHard: { soft: 0, hard: 0 },
  };
  for (const row of rows) {
    const feature = featureBucket(row.point || row);
    result.remaining[feature.remaining] += 1;
    result.score[feature.score] += 1;
    result.softHard[feature.softHard] += 1;
  }
  return result;
}

function runExactReferenceCycles(baseline) {
  const orders = [];
  const rows = [];
  const solver = new RoundL1Solver({ maxStates: 100000, maxMs: 10000 });
  const started = performance.now();
  for (let index = 0; index < STRATEGY_CYCLES; index += 1) {
    const label = `r3-strategy-${index}`;
    const order = makeDeckOrder(label);
    const exact = simulateCycleL1({ solver, seedLabel: label, cardOrder: order });
    orders.push(order);
    rows.push({
      averageDistance: exact.averageDistance,
      totalDistance: exact.totalDistance,
      roundCount: exact.roundCount,
      roundDistances: exact.roundDistances,
    });
    solver.roundMetrics.length = 0;
  }
  return {
    orders,
    rows,
    elapsedMs: performance.now() - started,
    baselineComplete: baseline.complete,
  };
}

function measureStrategyCycles(name, definition, reference) {
  const policy = policyFromDefinition(definition);
  const started = performance.now();
  const cycleDifferences = [];
  const approximateRows = [];
  const allExactDistances = [];
  const allApproxDistances = [];
  for (let index = 0; index < reference.rows.length; index += 1) {
    const label = `r3-strategy-${index}`;
    const approximate = simulateCycleApprox({
      policy,
      seedLabel: label,
      cardOrder: reference.orders[index],
    });
    const exact = reference.rows[index];
    cycleDifferences.push(approximate.averageDistance - exact.averageDistance);
    approximateRows.push({
      averageDistance: approximate.averageDistance,
      totalDistance: approximate.totalDistance,
      roundCount: approximate.roundCount,
    });
    allExactDistances.push(...exact.roundDistances);
    allApproxDistances.push(...approximate.roundDistances);
  }
  return {
    name,
    definition,
    cycles: approximateRows.length,
    elapsedMs: performance.now() - started,
    l1AverageDistance: mean(allExactDistances),
    strategyAverageDistance: mean(allApproxDistances),
    meanDifferenceStrategyMinusL1: mean(cycleDifferences),
    pairedCi95StrategyMinusL1: ci95(cycleDifferences),
    cycleAverageDistanceCi95: ci95(approximateRows.map((row) => row.averageDistance)),
    l1AverageRounds: mean(reference.rows.map((row) => row.roundCount)),
    strategyAverageRounds: mean(approximateRows.map((row) => row.roundCount)),
    cycleDifferenceSamples: cycleDifferences,
  };
}

function measurePolicyTiming(definition, points) {
  const policy = policyFromDefinition(definition);
  const times = [];
  for (const point of points) {
    const started = performance.now();
    policy({
      counts: point.counts,
      lowTotal: point.lowTotal,
      hasAce: point.hasAce,
      currentScore: point.currentScore,
      remaining: point.remaining,
    });
    times.push(performance.now() - started);
  }
  return summarizeTimes(times);
}

function runCrnStudy(definition, baseline) {
  const policy = policyFromDefinition(definition);
  const points = baseline.targetedPoints.slice(0, CRN_STATE_COUNT);
  const rows = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const common = evaluateL2({
      state: point,
      policy,
      lambda: baseline.lambda,
      maxRollouts: MAX_ROLLOUTS,
      seedLabel: `r3-crn-${index}`,
      commonRandomNumbers: true,
      sequential: false,
    });
    const independent = evaluateL2({
      state: point,
      policy,
      lambda: baseline.lambda,
      maxRollouts: MAX_ROLLOUTS,
      seedLabel: `r3-crn-${index}`,
      commonRandomNumbers: false,
      sequential: false,
    });
    rows.push({
      index,
      remaining: point.remaining,
      currentScore: point.currentScore,
      l1Action: point.l1.action,
      common: compactL2(common),
      independent: compactL2(independent),
      widthReductionRatio: 1 - (common.ciWidth / independent.ciWidth),
    });
  }
  const commonWidths = rows.map((row) => row.common.ciWidth);
  const independentWidths = rows.map((row) => row.independent.ciWidth);
  const meanCommon = mean(commonWidths);
  const meanIndependent = mean(independentWidths);
  return {
    requestedStates: CRN_STATE_COUNT,
    states: rows.length,
    rolloutsPerOption: MAX_ROLLOUTS,
    rows,
    commonCiWidthMean: meanCommon,
    independentCiWidthMean: meanIndependent,
    widthReductionRatioMean: 1 - (meanCommon / meanIndependent),
    widthReductionRatioCi95: ci95(rows.map((row) => row.widthReductionRatio)),
    commonCiWidthP50: percentile(commonWidths, 0.5),
    independentCiWidthP50: percentile(independentWidths, 0.5),
  };
}

function runSequentialStudy(definition, baseline) {
  const policy = policyFromDefinition(definition);
  const points = baseline.targetedPoints.slice(0, SEQUENTIAL_STATE_COUNT);
  const started = performance.now();
  const rows = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const l2 = evaluateL2({
      state: point,
      policy,
      lambda: baseline.lambda,
      maxRollouts: MAX_ROLLOUTS,
      seedLabel: `r3-sequential-${index}`,
      commonRandomNumbers: true,
      sequential: true,
      minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
    });
    rows.push({ index, point, result: compactL2(l2) });
  }
  const actual = rows.map((row) => row.result.completedRollouts);
  return {
    requestedStates: SEQUENTIAL_STATE_COUNT,
    states: rows.length,
    maxRollouts: MAX_ROLLOUTS,
    minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
    averageActualRolloutsPerOption: mean(actual),
    actualRolloutsP50: percentile(actual, 0.5),
    actualRolloutsP95: percentile(actual, 0.95),
    fullMaxCount: actual.filter((value) => value === MAX_ROLLOUTS).length,
    earlyStopCount: actual.filter((value) => value < MAX_ROLLOUTS).length,
    elapsedMs: performance.now() - started,
    averageElapsedMs: mean(rows.map((row) => row.result.elapsedMs)),
    rows,
  };
}

function targetedRow(point, result) {
  const feature = featureBucket(point);
  const opposed = result.l2Action !== point.l1.action;
  const significant = isCiExcludingZero(result.ci95);
  return {
    remaining: point.remaining,
    currentScore: point.currentScore,
    softHard: feature.softHard,
    remainingBucket: feature.remaining,
    scoreBucket: feature.score,
    l1Action: point.l1.action,
    l1StopDistance: point.l1.stopDistance,
    l1DrawExpectedDistance: point.l1.drawExpectedDistance,
    l2Action: result.l2Action,
    drawMinusStop: result.drawMinusStop,
    ci95: result.ci95,
    ciWidth: result.ciWidth,
    completedRollouts: result.completedRollouts,
    stoppedEarly: result.stoppedEarly,
    complete: result.complete,
    opposed,
    significant,
    adopted: opposed && significant,
  };
}

function runTargetedStudy(definition, baseline) {
  const policy = policyFromDefinition(definition);
  const points = baseline.targetedPoints.slice(0, TARGETED_EVAL_LIMIT);
  const started = performance.now();
  const rows = [];
  let aborted = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    try {
      const result = evaluateL2({
        state: point,
        policy,
        lambda: baseline.lambda,
        maxRollouts: MAX_ROLLOUTS,
        seedLabel: `r3-targeted-${index}`,
        commonRandomNumbers: true,
        sequential: true,
        minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
      });
      rows.push({ point, ...targetedRow(point, result) });
      if ((index + 1) % 50 === 0 || index + 1 === points.length) {
        console.log(`  targeted L2 ${index + 1}/${points.length}; adopted=${rows.filter((row) => row.adopted).length}`);
      }
    } catch (error) {
      aborted = { index, reason: error.message, name: error.name };
      break;
    }
  }
  const completeRows = rows.filter((row) => row.complete);
  const opposedRows = completeRows.filter((row) => row.opposed);
  const significantRows = completeRows.filter((row) => row.significant);
  const adoptedRows = completeRows.filter((row) => row.adopted);
  const examplesSource = adoptedRows.length ? adoptedRows : opposedRows.length ? opposedRows : completeRows;
  return {
    requestedPoints: TARGETED_EVAL_LIMIT,
    availablePoints: baseline.targetedPoints.length,
    evaluatedPoints: rows.length,
    completePoints: completeRows.length,
    aborted,
    elapsedMs: performance.now() - started,
    opposedCount: opposedRows.length,
    significantCount: significantRows.length,
    adoptedCount: adoptedRows.length,
    opposedRate: completeRows.length ? opposedRows.length / completeRows.length : Number.NaN,
    adoptedRate: completeRows.length ? adoptedRows.length / completeRows.length : Number.NaN,
    featuresAll: featureCounts(completeRows),
    featuresOpposed: featureCounts(opposedRows),
    featuresAdopted: featureCounts(adoptedRows),
    actualRolloutsMean: mean(completeRows.map((row) => row.completedRollouts)),
    actualRolloutsP50: percentile(completeRows.map((row) => row.completedRollouts), 0.5),
    actualRolloutsP95: percentile(completeRows.map((row) => row.completedRollouts), 0.95),
    examples: examplesSource.slice(0, 3),
    rows,
  };
}

function waitForWorkerReady(worker) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message.type === 'ready') {
        worker.off('error', reject);
        resolve();
      }
    };
    worker.on('message', onMessage);
    worker.once('error', reject);
  });
}

function requestWorker(worker, id, payload) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message.id !== id) return;
      worker.off('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    worker.on('message', onMessage);
    worker.postMessage({ id, ...payload });
  });
}

async function runPersistentWorkerTiming(definition, baseline, states) {
  const workerStarted = performance.now();
  const worker = new Worker(new URL('./r3-worker.mjs', import.meta.url), {
    workerData: { definition, lambda: baseline.lambda },
  });
  try {
    await waitForWorkerReady(worker);
    const startupMs = performance.now() - workerStarted;
    const times = [];
    const results = [];
    for (let index = 0; index < states.length; index += 1) {
      const started = performance.now();
      const result = await requestWorker(worker, index, {
        state: states[index],
        maxRollouts: MAX_ROLLOUTS,
        seedLabel: `r3-worker-timing-${index}`,
        commonRandomNumbers: true,
        sequential: true,
        minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
      });
      times.push(performance.now() - started);
      results.push({ completedRollouts: result.completedRollouts, l2Action: result.l2Action, ci95: result.ci95 });
    }
    return { startupMs, taskTime: summarizeTimes(times), results };
  } finally {
    await worker.terminate();
  }
}

async function main() {
  const started = performance.now();
  const baseline = readBaseline();
  console.log(`[R3-C] derive exact-L1 offline threshold tables; baseline cycles=${baseline.completedCycles}/${baseline.requestedCycles}`);
  const fixedDefinition = buildFixedThresholdDefinition();
  const compositionDefinition = buildCompositionDefinition(baseline.calibrationPoints, fixedDefinition);
  const definitions = { fixed: fixedDefinition, composition: compositionDefinition };
  const reference = runExactReferenceCycles(baseline);
  const strategyResults = {};
  const timingPoints = baseline.calibrationPoints.slice(0, Math.max(TIMING_STATE_COUNT, 5000));
  for (const [key, definition] of Object.entries(definitions)) {
    console.log(`[R3-C] strategy=${key}; benchmark cycles=${STRATEGY_CYCLES}`);
    const measured = measureStrategyCycles(key, definition, reference);
    measured.decisionTimingMs = measurePolicyTiming(definition, timingPoints);
    measured.fallbackRateOnCalibration = strategyFallbackRate(definition, timingPoints);
    strategyResults[key] = measured;
    console.log(`  ${key}: strategy-L1=${formatNumber(measured.meanDifferenceStrategyMinusL1, 6)}; timing p95=${formatNumber(measured.decisionTimingMs.p95, 6)}ms`);
  }
  const selectedKey = Object.keys(strategyResults).sort((a, b) => (
    strategyResults[a].meanDifferenceStrategyMinusL1 - strategyResults[b].meanDifferenceStrategyMinusL1
  ))[0];
  const selectedDefinition = definitions[selectedKey];
  console.log(`[R3-C] selected=${selectedKey}; reason=lowest paired mean distance difference`);

  console.log('[R3-D] common random numbers vs independent random streams');
  const crn = runCrnStudy(selectedDefinition, baseline);
  console.log(`[R3-D] mean CI width common=${formatNumber(crn.commonCiWidthMean, 6)}; independent=${formatNumber(crn.independentCiWidthMean, 6)}; reduction=${formatNumber(crn.widthReductionRatioMean * 100, 2)}%`);
  console.log('[R3-E] sequential stopping');
  const sequential = runSequentialStudy(selectedDefinition, baseline);
  console.log(`[R3-E] states=${sequential.states}; actual rollouts mean=${formatNumber(sequential.averageActualRolloutsPerOption, 2)}; early=${sequential.earlyStopCount}`);
  console.log('[R3-F] targeted L2 decision points');
  const targeted = runTargetedStudy(selectedDefinition, baseline);
  console.log(`[R3-F] evaluated=${targeted.evaluatedPoints}/${targeted.requestedPoints}; opposed=${targeted.opposedCount}; adopted=${targeted.adoptedCount}`);

  const timingStates = baseline.targetedPoints.slice(0, TIMING_STATE_COUNT);
  const singleTimes = [];
  const singleTimingResults = [];
  const selectedPolicy = policyFromDefinition(selectedDefinition);
  for (let index = 0; index < timingStates.length; index += 1) {
    const timingStarted = performance.now();
    const result = evaluateL2({
      state: timingStates[index],
      policy: selectedPolicy,
      lambda: baseline.lambda,
      maxRollouts: MAX_ROLLOUTS,
      seedLabel: `r3-single-timing-${index}`,
      commonRandomNumbers: true,
      sequential: true,
      minRolloutsForStop: MIN_ROLLOUTS_FOR_STOP,
    });
    singleTimes.push(performance.now() - timingStarted);
    singleTimingResults.push({ completedRollouts: result.completedRollouts, l2Action: result.l2Action, ci95: result.ci95 });
  }
  const singleTiming = { times: summarizeTimes(singleTimes), results: singleTimingResults };
  console.log('[R3-H] persistent worker timing');
  const workerTiming = await runPersistentWorkerTiming(selectedDefinition, baseline, timingStates);
  console.log(`[R3-H] single p95=${formatNumber(singleTiming.times.p95, 3)}ms; persistent worker p95=${formatNumber(workerTiming.taskTime.p95, 3)}ms; startup=${formatNumber(workerTiming.startupMs, 3)}ms`);

  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model || 'unknown',
    logicalCpus: cpus().length,
    command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-l2.mjs',
    baseline: {
      path: BASELINE_PATH,
      requestedCycles: baseline.requestedCycles,
      completedCycles: baseline.completedCycles,
      complete: baseline.complete,
      lambda: baseline.lambda,
    },
    strategyCycles: STRATEGY_CYCLES,
    strategyDefinitions: definitions,
    strategyResults,
    selectedStrategy: selectedKey,
    selectedDefinition,
    selectionReason: '以 300 個成對 seeded 週期的近似策略−exact L1 每局平均距離差最低者選出；不是依 CI 偷改規則。',
    referenceElapsedMs: reference.elapsedMs,
    crn,
    sequential,
    targeted,
    timing: {
      stateCount: timingStates.length,
      singleThread: singleTiming,
      persistentWorker: workerTiming,
      mobileEstimateFactor: 4,
    },
    totalElapsedMs: performance.now() - started,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[R3-C/H] wrote ${RESULT_PATH}; total=${formatNumber(result.totalElapsedMs / 1000, 3)}s`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
