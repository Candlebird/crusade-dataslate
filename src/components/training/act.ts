import { toast } from '../ui';

/** Run an engine action that throws on a problem: a refusal shows as an error toast. Then refresh. */
export function act(fn: () => void, onChange: () => void): boolean {
  let ok = true;
  try {
    fn();
  } catch (err) {
    ok = false;
    toast((err as Error).message, 'error');
  }
  onChange();
  return ok;
}
