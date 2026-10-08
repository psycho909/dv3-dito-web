// PROTOTYPE — isolate exact L1 lambda cycles into short child-process batches.
// This preserves the same absolute seeded cycle labels while avoiding cumulative
// process-resource behaviour observed in one long-lived Node process.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ci95, mean, percentile, sum } from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const CHILD = join(DIR, 'run-r3-lambda.mjs');
const OUTPUT = join(DIR, 'r3-lambda.json');
const TOTAL_CYCLES = Number(process.env.R3_LAMBDA_CYCLES || 2000);
const CHUNK_SIZE = Number(process.env.R3_LAMBDA_CHUNK_SIZE || 100);
const TARGETED_POINT_TARGET = Number(process.env.R3_TARGETED_POINTS || 800);
const CALIBRATION_POINT_TARGET = Number(process.env.R3_CALIBRATION_POINTS || 5000);
const chunkFiles = [];
const chunks = [];
const failures = [];

function parseChunk(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function runChunk(start, end) {
  const fileName = `r3-lambda-chunk-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`;
  const path = join(DIR, fileName);
  chunkFiles.push(path);
  const environment = {
    ...process.env,
    R3_LAMBDA_CYCLES: String(TOTAL_CYCLES),
    R3_LAMBDA_START: String(start),
    R3_LAMBDA_END: String(end),
    R3_LAMBDA_RESULT: fileName,
    R3_TARGETED_POINTS: String(TARGETED_POINT_TARGET),
    R3_CALIBRATION_POINTS: String(CALIBRATION_POINT_TARGET),
    R3_VERBOSE: '0',
    R3_LAMBDA_MAX_MS: '600000',
  };
  const child = spawnSync(process.execPath, ['--expose-gc', CHILD], {
    cwd: DIR,
    env: environment,
    encoding: 'utf8',
    timeout: 900000,
    windowsHide: true,
  });
  const data = parseChunk(path);
  const expected = end - start;
  const valid = data
    && data.completedCycles === expected
    && Array.isArray(data.distanceValues)
    && data.cycleAverages.length === expected
    && data.roundsPerCycle.length === expected;
  if (!valid) {
    failures.push({
      start,
      end,
      status: child.status,
      signal: child.signal,
      error: child.error?.message || null,
      stdoutTail: (child.stdout || '').slice(-1000),
      stderrTail: (child.stderr || '').slice(-1000),
    });
    console.log(`[R3-BATCH] FAILED chunk ${start}-${end}`);
    return;
  }
  chunks.push(data);
  console.log(`[R3-BATCH] chunk ${start}-${end} complete; rounds=${data.totalRounds}; lambda=${data.lambda.toFixed(9)}`);
}

function mergeChunks() {
  const distances = chunks.flatMap((chunk) => chunk.distanceValues);
  const cycleAverages = chunks.flatMap((chunk) => chunk.cycleAverages);
  const roundsPerCycle = chunks.flatMap((chunk) => chunk.roundsPerCycle);
  const targetedPoints = chunks.flatMap((chunk) => chunk.targetedPoints).slice(0, TARGETED_POINT_TARGET);
  const calibrationPoints = chunks.flatMap((chunk) => chunk.calibrationPoints).slice(0, Math.max(10000, CALIBRATION_POINT_TARGET));
  const cacheMaxima = chunks.flatMap((chunk) => {
    const count = chunk.completedCycles;
    return new Array(count).fill(chunk.perRoundCache.maxStatesMax);
  });
  const cycleTimes = chunks.flatMap((chunk) => new Array(chunk.completedCycles).fill(chunk.cycleElapsedMs.p50));
  const first = chunks[0];
  const complete = failures.length === 0 && chunks.length * CHUNK_SIZE >= TOTAL_CYCLES;
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: first?.cpu || 'unknown',
    logicalCpus: first?.logicalCpus || null,
    command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-lambda-batch.mjs',
    rules: first?.rules || null,
    requestedCycles: TOTAL_CYCLES,
    completedCycles: cycleAverages.length,
    complete,
    aborted: failures.length ? { reason: 'one or more isolated chunks failed', failures } : null,
    lambda: mean(distances),
    distanceCi95: ci95(distances),
    cycleAverageDistance: mean(cycleAverages),
    cycleAverageDistanceCi95: ci95(cycleAverages),
    averageRounds: mean(roundsPerCycle),
    roundsCi95: ci95(roundsPerCycle),
    totalRounds: distances.length,
    distanceValues: distances,
    cycleAverages,
    roundsPerCycle,
    totalElapsedMs: sum(chunks.map((chunk) => chunk.totalElapsedMs)),
    cycleElapsedMs: {
      p50: percentile(cycleTimes, 0.5),
      p95: percentile(cycleTimes, 0.95),
      max: cycleTimes.length ? Math.max(...cycleTimes) : Number.NaN,
    },
    perRoundCache: {
      maxStatesP50: percentile(cacheMaxima, 0.5),
      maxStatesP95: percentile(cacheMaxima, 0.95),
      maxStatesMax: cacheMaxima.length ? Math.max(...cacheMaxima) : Number.NaN,
    },
    peakHeapUsedBytes: Math.max(...chunks.map((chunk) => chunk.peakHeapUsedBytes || 0)),
    targetedPointTarget: TARGETED_POINT_TARGET,
    targetedPoints,
    calibrationPointTarget: calibrationPoints.length,
    calibrationPoints,
    chunkEvidence: chunks.map((chunk) => ({
      requestedStart: chunk.requestedCycles,
      completedCycles: chunk.completedCycles,
      totalRounds: chunk.totalRounds,
      lambda: chunk.lambda,
    })),
  };
}

for (let start = 0; start < TOTAL_CYCLES; start += CHUNK_SIZE) {
  runChunk(start, Math.min(TOTAL_CYCLES, start + CHUNK_SIZE));
}
if (chunks.length > 0) {
  const merged = mergeChunks();
  writeFileSync(OUTPUT, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`[R3-BATCH] merged cycles=${merged.completedCycles}/${TOTAL_CYCLES}; complete=${merged.complete}; lambda=${merged.lambda.toFixed(9)}`);
}
for (const path of chunkFiles) {
  try { unlinkSync(path); } catch { /* preserve unavailable failed evidence */ }
}
if (failures.length > 0) process.exitCode = 1;
