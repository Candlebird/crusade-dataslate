import { useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from '../model/store';
import type { Force } from '../model/types';
import { Icon } from './Icon';

// Forces with edit mode switched on. Kept in memory only, so every reload starts locked again.
const editing = new Set<string>();
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function setEditing(forceId: string, on: boolean) {
  if (on) editing.add(forceId);
  else editing.delete(forceId);
  listeners.forEach((l) => l());
}

/**
 * Whether the force's manual controls (adding units, RP, shards, XP, traits…) are shown.
 * A force in a Nexus War gets these from the campaign, so they stay hidden until its player turns on edit mode
 * to fix a mistake. Every other force can always be edited.
 */
export function useEditMode(f: Force | undefined): { nexus: boolean; edit: boolean; toggle: () => void } {
  const { state } = useStore();
  const id = f?.id ?? '';
  const on = useSyncExternalStore(subscribe, () => editing.has(id));
  const nexus = !!f?.nexus && !!state.campaign;
  return { nexus, edit: !nexus || on, toggle: () => setEditing(id, !on) };
}

/** The top-right switch on a Nexus Wars force's pages. */
export function EditModeButton({ f }: { f: Force }) {
  const { nexus, edit, toggle } = useEditMode(f);
  if (!nexus) return null;
  return (
    <button
      className={edit ? 'primary' : ''}
      aria-pressed={edit}
      onClick={toggle}
      data-tip={edit ? 'Hide the manual controls' : 'Show manual controls to fix an untracked game or wrong reward'}
    >
      <Icon name="l:pencil" /> {edit ? 'Editing — done' : 'Edit mode'}
    </button>
  );
}

/** The reminder shown while edit mode is on. */
export function EditModeNotice({ f }: { f: Force }) {
  const { nexus, edit } = useEditMode(f);
  if (!nexus || !edit) return null;
  return (
    <div className="panel notice small">
      <b>Edit mode is on.</b> <span className="muted">Changes skip the Nexus Wars rules: nothing is paid for or checked. Fix mistakes, then switch it off.</span>
    </div>
  );
}

/** A value shown in place of its input while edit mode is off. */
export function Fixed({ children }: { children: ReactNode }) {
  return <span className="fixed">{children}</span>;
}
