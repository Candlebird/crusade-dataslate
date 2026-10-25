import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// `npm test`: everything but the balance bot's long sweeps (*.balance.test.ts, `npm run test:balance`).
export default mergeConfig(viteConfig, defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'], exclude: [...configDefaults.exclude, '**/*.balance.test.ts'] },
}));
