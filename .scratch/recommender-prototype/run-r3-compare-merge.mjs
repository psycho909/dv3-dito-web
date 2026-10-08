// PROTOTYPE — merge isolated paired full-cycle comparison chunks.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ci95, isCiExcludingZero, mean, sum } from './r3-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(DIR, 'r3-compare.json');
const TOTAL_CYCLES = Number(process.env.R3_COMPARE_CYCLES || 200);
const CHUNK_SIZE = Number(process.env.R3_COMPARE_CHUNK_SIZE || 10);
const chunks = [];
const missing = [];

for (let start = 0; start < TOTAL_CYCLES; start += CHUNK_SIZE) {
  const end = Math.min(TOTAL_CYCLES, start + CHUNK_SIZE);
  const names = [
    `r3-compare-segment-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
    `r3-compare-chunk-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
  ];
  const path = names.map((name) => join(DIR, name)).find((candidate) => existsSync(candidate))
    || names.map((name) => join(DIR, `${name} `)).find((candidate) => existsSync(candidate));
  if (!path) {
    missing.push({ start, end, paths: names.map((name) => join(DIR, name)) });
    continue;
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const expected = end - start;
    if (data.cycleStart !== start || data.cycleEnd !== end || data.completedCycles !== expected || !data.complete) {
      missing.push({ start, end, path, reason: 'invalid or incomplete comparison chunk' });
      continue;
    }
    chunks.push({ start, end, data, path });
  } catch (error) {
    missing.push({ start, end, path, reason: error.message });
  }
}

const pureDistances = chunks.flatMap(({ data }) => data.pureL1.distanceValues);
const hybridDistances = chunks.flatMap(({ data }) => data.hybridL1L2.distanceValues);
const pureAverages = chunks.flatMap(({ data }) => data.pureL1.cycleAverages);
const hybridAverages = chunks.flatMap(({ data }) => data.hybridL1L2.cycleAverages);
const pureRounds = chunks.flatMap(({ data }) => data.pureL1.roundCounts);
const hybridRounds = chunks.flatMap(({ data }) => data.hybridL1L2.roundCounts);
const paired = chunks.flatMap(({ data }) => data.pairedImprovementPureMinusHybrid.values);
const stats = chunks.reduce((total, { data }) => ({
  l1DecisionPoints: total.l1DecisionPoints + data.stats.l1DecisionPoints,
  l2EvaluatedStates: total.l2EvaluatedStates + data.stats.l2EvaluatedStates,
  l2CacheHits: total.l2CacheHits + data.stats.l2CacheHits,
  l2Incomplete: total.l2Incomplete + data.stats.l2Incomplete,
  adoptedDecisions: total.adoptedDecisions + data.stats.adoptedDecisions,
  l2CacheStatesAcrossChunks: total.l2CacheStatesAcrossChunks + data.stats.l2CacheStates,
}), {
  l1DecisionPoints: 0,
  l2EvaluatedStates: 0,
  l2CacheHits: 0,
  l2Incomplete: 0,
  adoptedDecisions: 0,
  l2CacheStatesAcrossChunks: 0,
});
const first = chunks[0]?.data;
const ci = ci95(paired);
const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: first?.cpu || 'unknown',
  logicalCpus: first?.logicalCpus || null,
  command: 'node --expose-gc .scratch\\recommender-prototype\\run-r3-compare-merge.mjs',
  requestedCycles: TOTAL_CYCLES,
  completedCycles: paired.length,
  complete: missing.length === 0 && paired.length === TOTAL_CYCLES && stats.l2Incomplete === 0,
  aborted: missing.length ? { reason: 'missing or invalid comparison chunks', missing } : (stats.l2Incomplete ? { reason: 'one or more L2 evaluations incomplete', count: stats.l2Incomplete } : null),
  selectedStrategy: first?.selectedStrategy || null,
  lambda: first?.lambda,
  pureL1: {
    averageDistance: mean(pureDistances),
    cycleAverageDistance: mean(pureAverages),
    averageRoundsPerCycle: mean(pureRounds),
    totalRounds: pureDistances.length,
    cycleAverageCi95: ci95(pureAverages),
  },
  hybridL1L2: {
    averageDistance: mean(hybridDistances),
    cycleAverageDistance: mean(hybridAverages),
    averageRoundsPerCycle: mean(hybridRounds),
    totalRounds: hybridDistances.length,
    cycleAverageCi95: ci95(hybridAverages),
  },
  pairedImprovementPureMinusHybrid: {
    mean: mean(paired),
    ci95: ci,
    significant: isCiExcludingZero(ci) && ci[0] > 0,
    samples: paired.length,
  },
  stats,
  totalElapsedMs: sum(chunks.map(({ data }) => data.totalElapsedMs)),
  chunkEvidence: chunks.map(({ start, end, data }) => ({
    start,
    end,
    completedCycles: data.completedCycles,
    pairedImprovement: data.pairedImprovementPureMinusHybrid.mean,
    l2States: data.stats.l2EvaluatedStates,
    adopted: data.stats.adoptedDecisions,
  })),
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
console.log(`[R3-G-MERGE] chunks=${chunks.length}/${Math.ceil(TOTAL_CYCLES / CHUNK_SIZE)}; cycles=${result.completedCycles}/${TOTAL_CYCLES}; complete=${result.complete}`);
console.log(`[R3-G-MERGE] pure=${result.pureL1.averageDistance.toFixed(6)}; hybrid=${result.hybridL1L2.averageDistance.toFixed(6)}; improvement=${result.pairedImprovementPureMinusHybrid.mean.toFixed(6)}; CI=[${ci[0].toFixed(6)}, ${ci[1].toFixed(6)}]`);
if (!result.complete) {
  console.error(JSON.stringify(result.aborted));
  process.exitCode = 1;
} else if (process.env.R3_KEEP_COMPARE_CHUNKS !== '1') {
  for (const { path } of chunks) {
    try { unlinkSync(path); } catch { /* keep evidence if cleanup fails */ }
  }
}
