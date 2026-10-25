import type { EmblemLayer, Unit } from '../../model/types';
import { cardText, readyRecipes, type TrainingRun } from '../../rules/training';
import { cardTag } from './CardOffer';
import { DraftPanel } from './DraftPanel';
import { RecipeBook, type Crafting } from './RecipeBook';
import { ShopPanel } from './ShopPanel';
import { WaveStatus } from './WavePreview';

/** The side panel's tabs. A wide screen keeps the wave line and the log in view and tabs the rest (Build, Recipes,
 *  Shop); a phone tabs the wave line too. */
export type Tab = 'draft' | 'units' | 'shop' | 'wave';
const TABS: [Tab, string][] = [['draft', 'Build'], ['units', 'Recipes'], ['shop', 'Shop'], ['wave', 'Wave']];

/** Is the side panel wide (its wave line always shown, no Wave tab)? Matches the phone media query in styles.css. */
export const wideSide = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 861px) and (min-height: 561px)').matches;

export interface SidePanelProps {
  run: TrainingRun;
  units: Unit[];
  portraits: Record<string, EmblemLayer[]>;
  tab: Tab;
  onTab: (t: Tab) => void;
  /** DraftPanel's: the hand Shard the next tap places, the piece picked, and the keep hover's lit pieces. */
  pick: number | null;
  onPick: (i: number | null) => void;
  sel: number | null;
  onFocus: (ids: number[] | null) => void;
  /** The craft under way (if any), and starting one (the shell then waits for a tap on the map). */
  crafting: Crafting | null;
  onCraft: (c: Crafting | null) => void;
  /** The card offer is hidden for a look at the field: a button brings it back. */
  peek: boolean;
  onUnpeek: () => void;
  onChange: () => void;
}

export function SidePanel(p: SidePanelProps) {
  const { run, tab } = p;
  const build = run.phase === 'build';
  const over = run.phase === 'over';
  const sec = (k: Tab, extra = '') => `training-sec training-sec-${k}${extra}${tab === k ? ' on' : ''}`;
  return (
    <div className={`training-side small${tab === 'wave' ? ' tab-wave' : ''}`}>
      <div className="training-tabs" role="tablist" aria-label="Panels">
        {TABS.map(([k, name]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${tab === k ? 'primary' : ''}${k === 'wave' ? ' training-tab-wave' : ''}`} onClick={() => p.onTab(k)}>
            {name}{k === 'units' && build && readyRecipes(run).length > 0 && <span className="training-tab-dot" aria-label="(a unit is ready)" />}
          </button>
        ))}
      </div>
      <div className={sec('draft')}>
        {build && run.offer && p.peek && <button className="primary" onClick={p.onUnpeek}>Pick a card</button>}
        {run.phase === 'wave' && run.offer && <div className="muted">The Echo Lord fell: pick a card after this wave.</div>}
        <DraftPanel run={run} pick={p.pick} sel={p.sel} onPick={p.onPick} onFocus={p.onFocus} onChange={p.onChange} />
      </div>
      <div className={sec('units')}>
        {!over && <RecipeBook run={run} units={p.units} portraits={p.portraits} crafting={p.crafting} onCraft={p.onCraft} />}
      </div>
      <div className={sec('shop')}>
        {!over && <ShopPanel run={run} onChange={p.onChange} />}
      </div>
      <div className={sec('wave')}>
        <WaveStatus run={run} />
        {run.cards.length > 0 && (
          <div className="training-held">
            <b>Cards</b>{' '}
            {run.cards.map((d, i) => {
              const t = cardText(run, d);
              return <span key={i} className={`tag ${cardTag(d)}`} data-tip={`${t.name}: ${t.text}`}>{t.name}</span>;
            })}
          </div>
        )}
        <div className="training-log muted small" aria-label="Run log, newest first">
          {run.log.slice(-20).reverse().map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
