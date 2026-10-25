import { parentPort } from 'node:worker_threads';
import { playJob, type BotJob } from './botJobs';

// Test-only: botPool's worker thread (bundled by esbuild). Plays each job it is sent and posts back what it did.

parentPort?.on('message', ({ i, job }: { i: number; job: BotJob }) => {
  try {
    parentPort!.postMessage({ i, out: playJob(job) });
  } catch (e) {
    parentPort!.postMessage({ i, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});
