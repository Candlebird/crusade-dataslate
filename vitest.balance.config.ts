import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// `npm run test:balance`: the balance bot's sweeps. Each file plays its runs on botPool's threads (a core each), so the
// files go one at a time rather than fighting over the cores.
export default mergeConfig(viteConfig, defineConfig({
  test: { include: ['src/**/*.balance.test.ts'], fileParallelism: false },
}));
