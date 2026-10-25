import { mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { buildSync } from 'esbuild';
import type { BotJob, BotOut } from './botJobs';

// Test-only: plays balance-bot runs on worker threads, one a core, so a sweep of forces x seeds takes seconds, not
// minutes. Each run is seeded, so the results are the same as playing them one by one. Never imported by the app.

let bundle: { dir: string; file: string } | undefined;

/** botWorker.ts and all it imports as one plain-JS file a worker can load (esbuild, built once a test file). */
function workerFile(): string {
  if (bundle) return bundle.file;
  const dir = mkdtempSync(join(tmpdir(), 'opr-bot-'));
  const file = join(dir, 'botWorker.mjs');
  buildSync({
    entryPoints: [fileURLToPath(new URL('./botWorker.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: file, logLevel: 'error',
  });
  bundle = { dir, file };
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return file;
}

/** Play every job, at most `threads` (default: a core each, less one) at a time; the results in the jobs' order. */
export async function runBots(jobs: BotJob[], threads = Math.max(1, availableParallelism() - 1)): Promise<BotOut[]> {
  const out: BotOut[] = new Array(jobs.length);
  if (!jobs.length) return out;
  const file = workerFile();
  let next = 0;
  const one = () => new Promise<void>((resolve, reject) => {
    const w = new Worker(file);
    const feed = () => {
      if (next >= jobs.length) { void w.terminate().then(() => resolve()); return; }
      const i = next++;
      w.postMessage({ i, job: jobs[i] });
    };
    w.on('message', (m: { i: number; out?: BotOut; error?: string }) => {
      if (m.error) { void w.terminate(); reject(new Error(m.error)); return; }
      out[m.i] = m.out!;
      feed();
    });
    w.on('error', reject);
    feed();
  });
  await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, one));
  return out;
}
