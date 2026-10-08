// PROTOTYPE — persistent worker used only for ROUND 3 L2 timing.
import { parentPort, workerData } from 'node:worker_threads';
import { evaluateL2, policyFromDefinition } from './r3-core.mjs';

const policy = policyFromDefinition(workerData.definition);
const lambda = workerData.lambda;

parentPort.postMessage({ type: 'ready' });

parentPort.on('message', (message) => {
  try {
    const result = evaluateL2({
      state: message.state,
      policy,
      lambda,
      maxRollouts: message.maxRollouts ?? 2000,
      seedLabel: message.seedLabel ?? 'worker',
      commonRandomNumbers: message.commonRandomNumbers ?? true,
      sequential: message.sequential ?? true,
      minRolloutsForStop: message.minRolloutsForStop ?? 30,
      maxMs: message.maxMs ?? Number.POSITIVE_INFINITY,
    });
    const { rawDifferenceSample, ...compact } = result;
    parentPort.postMessage({ id: message.id, result: compact });
  } catch (error) {
    parentPort.postMessage({
      id: message.id,
      error: { name: error.name, message: error.message, stack: error.stack },
    });
  }
});
