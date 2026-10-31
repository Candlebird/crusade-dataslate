import { useState } from 'react';

// Which maze blueprint shows as the ghost in this device's runs, and whether it is hidden: kept per device (the
// blueprints themselves sync with the account).

const PICK_KEY = 'training-blueprint';
const HIDE_KEY = 'training-blueprint-hide';

const read = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch { /* a private window: not remembered */ }
};

/** The id of the blueprint in use (null: none), and a setter. */
export function useBlueprintPick(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState(() => read(PICK_KEY));
  return [id, (v) => { setId(v); write(PICK_KEY, v); }];
}

/** Whether the ghost is hidden in runs, and a setter. */
export function useBlueprintHidden(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = useState(() => read(HIDE_KEY) === '1');
  return [hidden, (v) => { setHidden(v); write(HIDE_KEY, v ? '1' : null); }];
}
