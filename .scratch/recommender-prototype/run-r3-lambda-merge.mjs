// PROTOTYPE — merge isolated ROUND 3 lambda chunks without rerunning them.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ci95, mean, percentile, sum } from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(DIR, 'r3-lambda.json');
const TOTAL_CYCLES = Number(process.env.R3_LAMBDA_CYCLES || 2000);
const CHUNK_SIZE = Number(process.env.R3_LAMBDA_CHUNK_SIZE || 100);
const TARGETED_POINT_TARGET = Number(process.env.R3_TARGETED_POINTS || 800);
const CALIBRATION_POINT_TARGET = Number(process.env.R3_CALIBRATION_POINTS || 10000);
const chunks = [];
const missing = [];

for (let start = 0; start < TOTAL_CYCLES; start += CHUNK_SIZE) {
  const end = Math.min(TOTAL_CYCLES, start + CHUNK_SIZE);
  const names = [
    `r3-lambda-segment-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
    `r3-lambda-chunk-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
  ];
  const path = names.map((name) => join(DIR, name)).find((candidate) => existsSync(candidate))
    || names.map((name) => join(DIR, `${name} `)).find((candidate) => existsSync(candidate));
  if (!path) {
    missing.push({ start, end, paths: names.map((name) => join(DIR, name)) });
    continue;
  }
  try {
    const chunk = JSON.parse(readFileSync(path, 'utf8'));
    const expected = end - start;
    if (chunk.completedCycles !== expected
      || !Array.isArray(chunk.distanceValues)
      || chunk.cycleAverages.length !== expected
      || chunk.roundsPerCycle.length !== expected) {
      missing.push({ start, end, path, reason: 'invalid or incomplete chunk' });
      continue;
    }
    chunks.push({ start, end, data: chunk, path });
  } catch (error) {
    missing.push({ start, end, path, reason: error.message });
  }
}

const distances = chunks.flatMap(({ data }) => data.distanceValues);
const cycleAverages = chunks.flatMap(({ data }) => data.cycleAverages);
const roundsPerCycle = chunks.flatMap(({ data }) => data.roundsPerCycle);
const targetedPoints = chunks.flatMap(({ data }) => data.targetedPoints).slice(0, TARGETED_POINT_TARGET);
const calibrationPoints = chunks.flatMap(({ data }) => data.calibrationPoints).slice(0, CALIBRATION_POINT_TARGET);
const cycleElapsed = chunks.flatMap(({ data }) => new Array(data.completedCycles).fill(data.cycleElapsedMs.p50));
const first = chunks[0]?.data;
const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: first?.cpu || 'unknown',
  logicalCpus: first?.logicalCpus || null,
  command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-lambda-merge.mjs',
  rules: first?.rules || null,
  requestedCycles: TOTAL_CYCLES,
  completedCycles: cycleAverages.length,
  complete: missing.length === 0 && cycleAverages.length === TOTAL_CYCLES,
  aborted: missing.length ? { reason: 'missing or invalid isolated chunks', missing } : null,
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
  totalElapsedMs: sum(chunks.map(({ data }) => data.totalElapsedMs)),
  cycleElapsedMs: {
    p50: percentile(cycleElapsed, 0.5),
    p95: percentile(cycleElapsed, 0.95),
    max: cycleElapsed.length ? Math.max(...cycleElapsed) : Number.NaN,
  },
  perRoundCache: {
    maxStatesP50: percentile(chunks.map(({ data }) => data.perRoundCache.maxStatesMax), 0.5),
    maxStatesP95: percentile(chunks.map(({ data }) => data.perRoundCache.maxStatesMax), 0.95),
    maxStatesMax: chunks.length ? Math.max(...chunks.map(({ data }) => data.perRoundCache.maxStatesMax)) : Number.NaN,
  },
  peakHeapUsedBytes: chunks.length ? Math.max(...chunks.map(({ data }) => data.peakHeapUsedBytes || 0)) : Number.NaN,
  targetedPointTarget: TARGETED_POINT_TARGET,
  targetedPoints,
  calibrationPointTarget: calibrationPoints.length,
  calibrationPoints,
  chunkEvidence: chunks.map(({ start, end, data }) => ({
    start,
    end,
    completedCycles: data.completedCycles,
    totalRounds: data.totalRounds,
    lambda: data.lambda,
  })),
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
console.log(`[R3-B-MERGE] chunks=${chunks.length}/${Math.ceil(TOTAL_CYCLES / CHUNK_SIZE)}; cycles=${result.completedCycles}/${TOTAL_CYCLES}; complete=${result.complete}`);
console.log(`[R3-B-MERGE] lambda=${result.lambda.toFixed(9)}; rounds=${result.totalRounds}; targeted=${targetedPoints.length}; calibration=${calibrationPoints.length}`);
if (!result.complete) {
  console.error(JSON.stringify(result.aborted));
  process.exitCode = 1;
} else if (process.env.R3_KEEP_CHUNKS !== '1') {
  for (const fileName of readdirSync(DIR)) {
    if (/^r3-lambda-(segment|chunk)-/.test(fileName)) {
      try { unlinkSync(join(DIR, fileName)); } catch { /* keep evidence if cleanup fails */ }
    }
  }
}
