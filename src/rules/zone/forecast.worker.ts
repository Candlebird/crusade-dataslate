import { forecast } from './forecast';
import type { ZBattle } from './state';

// Runs the forecast off the page's thread, so the board stays responsive while the sims play.
self.onmessage = (e: MessageEvent<{ id: number; battle: ZBattle; n: number }>) => {
  const { id, battle, n } = e.data;
  (self as unknown as Worker).postMessage({ id, result: forecast(battle, n) });
};
