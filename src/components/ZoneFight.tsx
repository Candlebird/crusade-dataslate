import { lazy, Suspense, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { nowIso } from '../model/factory';
import { ZONE_REWARDS, type ZoneMode } from '../rules/zone/rewards';
import { savedBattle, type ZoneCtx, type ZoneSave } from '../rules/zone/save';
import { startZoneBattle } from '../rules/zone/setup';
import type { ZBattle } from '../rules/zone/state';
import type { TrackedBattle } from '../rules/tracker';
import { Modal } from './ui';
import { Icon } from './Icon';

const ZoneBattleModal = lazy(() => import('./ZoneBattleModal'));

// Starting and resuming a zone battle: pick how it's played, then the battle itself. It's saved (and synced) after
// every step, so closing it, or picking it up on another device, loses nothing.

/** Zone battles ship to the GM first (and to anyone not signed in, playing on their own device), until the GM opens them to all. */
export function useZoneBattles() {
  const cloud = useCloud();
  const { state } = useStore();
  return cloud.isGm || !cloud.email || !!state.campaign?.zoneOpen;
}

/** The saved zone battle with this id, if any. */
export function useZoneSave(id: string | undefined) {
  const { state } = useStore();
  return id ? state.zoneSaves?.find((z) => z.id === id) : undefined;
}

const MODE_TEXT: Record<ZoneMode, { label: string; text: string }> = {
  command: { label: 'Command', text: 'You give every order for your side; the AI plays the other.' },
  quick: { label: 'Quick', text: 'The AI plays both sides while you watch.' },
};
const rewardText = (m: ZoneMode) => `${Math.round(ZONE_REWARDS[m].xp * 100)}% XP${ZONE_REWARDS[m].rolls ? ' and reward rolls' : ', no reward rolls'}; no match bonus or Strategic Asset`;

/**
 * A zone battle for `tracked`, saved as `id`. With no save yet it asks how to play it (`modes`), then plays it.
 * `onApply` gets the ended battle once the player takes the result; the save goes then. `stakes` stands in for the
 * losses-and-rewards text when only the outcome counts (a meeting engagement, a Marauder band).
 */
export default function ZoneFight({ id, title, tracked, ctx, modes = ['command', 'quick'], practice, stakes, onApply, onClose }: {
  id: string; title: string; tracked: TrackedBattle; ctx: ZoneCtx; modes?: ZoneMode[]; practice?: boolean; stakes?: string;
  onApply: (z: ZBattle, mode: ZoneMode, tracked: TrackedBattle) => void; onClose: () => void;
}) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const save = useZoneSave(id);
  const [err, setErr] = useState('');

  const start = (mode: ZoneMode) => {
    try {
      const { battle, effects } = startZoneBattle(tracked, state.forces, state.books, mode, state.campaign);
      if (practice) battle.practice = true;
      const s: ZoneSave = { id, owner: cloud.email ?? '', updatedAt: nowIso(), title, mode, ctx, tracked: structuredClone(tracked), effects, battle: savedBattle(battle) };
      update((d) => { d.zoneSaves = [...(d.zoneSaves ?? []).filter((z) => z.id !== id), s]; });
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const store = (z: ZBattle, mode: ZoneMode) => update((d) => {
    const s = d.zoneSaves?.find((x) => x.id === id);
    if (s) Object.assign(s, { battle: savedBattle(z), mode, updatedAt: nowIso() });
  });
  const done = (z: ZBattle, mode: ZoneMode) => {
    if (!practice) onApply(z, mode, save?.tracked ?? tracked);
    update((d) => { d.zoneSaves = (d.zoneSaves ?? []).filter((x) => x.id !== id); });
    onClose();
  };

  if (save) {
    return (
      <Suspense fallback={<Modal title={title} onClose={onClose}><p className="muted">Loading the battle…</p></Modal>}>
        <ZoneBattleModal key={save.id} battle={save.battle} mode={save.mode} effects={save.effects} title={save.title}
          canQuick={modes.includes('quick')} onSave={store} onDone={done} onClose={onClose} />
      </Suspense>
    );
  }
  return (
    <Modal title={<><Icon name="g:crossed-swords" /> {title}</>} onClose={onClose}>
      <p className="small muted">
        A battle on a board of 12" zones, each split into four 6" squares. Units move a square to Advance and two to Rush or Charge,
        and shoot in squares (24" is 4). Both sides take turns to deploy and to activate a unit, as at the table.
        {practice ? ' Practice: nothing is lost and nothing is earned.' : stakes ? ` ${stakes}` : ' Losses carry over as after a table game.'} It's saved after every step, so you can close it and carry on later, on any device.
      </p>
      {err && <p className="tag red">{err}</p>}
      <div className="zb-modes">
        {modes.map((m) => (
          <button key={m} className={m === 'command' ? 'primary' : ''} onClick={() => start(m)}>
            <b>{MODE_TEXT[m].label}</b>
            <span className="small">{MODE_TEXT[m].text}</span>
            {!practice && !stakes && <span className="small muted">{rewardText(m)}</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
