// PROTOTYPE — reproducible ROUND 3 orchestrator.
// Expensive work is isolated into short child processes; no production code is touched.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const TOTAL_LAMBDA_CYCLES = Number(process.env.R3_LAMBDA_CYCLES || 2000);
const LAMBDA_CHUNK = Number(process.env.R3_LAMBDA_CHUNK_SIZE || 100);
const TOTAL_COMPARE_CYCLES = Number(process.env.R3_COMPARE_CYCLES || 200);
const COMPARE_CHUNK = Number(process.env.R3_COMPARE_CHUNK_SIZE || 10);

function run(label, args, env = {}) {
  console.log(`[R3-ALL] ${label}`);
  const child = spawnSync(process.execPath, args, {
    cwd: DIR,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${label} exit=${child.status}`);
}

run('A L1', ['--expose-gc', 'run-r3-l1.mjs']);
for (let start = 0; start < TOTAL_LAMBDA_CYCLES; start += LAMBDA_CHUNK) {
  const end = Math.min(TOTAL_LAMBDA_CYCLES, start + LAMBDA_CHUNK);
  run(`B lambda ${start}-${end}`, ['--expose-gc', 'run-r3-lambda.mjs'], {
    R3_LAMBDA_CYCLES: String(TOTAL_LAMBDA_CYCLES),
    R3_LAMBDA_START: String(start),
    R3_LAMBDA_END: String(end),
    R3_LAMBDA_RESULT: `r3-lambda-segment-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
    R3_TARGETED_POINTS: '800',
    R3_CALIBRATION_POINTS: '5000',
  });
}
run('B merge', ['run-r3-lambda-merge.mjs'], {
  R3_LAMBDA_CYCLES: String(TOTAL_LAMBDA_CYCLES),
  R3_LAMBDA_CHUNK_SIZE: String(LAMBDA_CHUNK),
  R3_TARGETED_POINTS: '800',
  R3_CALIBRATION_POINTS: '10000',
});
run('C-F/H L2', ['--expose-gc', 'run-r3-l2.mjs']);
for (let start = 0; start < TOTAL_COMPARE_CYCLES; start += COMPARE_CHUNK) {
  const end = Math.min(TOTAL_COMPARE_CYCLES, start + COMPARE_CHUNK);
  run(`G compare ${start}-${end}`, ['--expose-gc', 'run-r3-compare.mjs'], {
    R3_COMPARE_CYCLES: String(TOTAL_COMPARE_CYCLES),
    R3_COMPARE_START: String(start),
    R3_COMPARE_END: String(end),
    R3_COMPARE_RESULT: `r3-compare-segment-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.json`,
  });
}
run('G merge', ['run-r3-compare-merge.mjs'], {
  R3_COMPARE_CYCLES: String(TOTAL_COMPARE_CYCLES),
  R3_COMPARE_CHUNK_SIZE: String(COMPARE_CHUNK),
});
console.log('[R3-ALL] A-H result JSON files are ready; report is REPORT-round3.md.');
