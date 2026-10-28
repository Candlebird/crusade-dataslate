import { Suspense, useEffect, useRef, useState } from 'react';
import { href, useRoute } from './route';
import ForceList from './components/ForceList';
import ForceView from './components/ForceView';
import UnitSheet from './components/UnitSheet';
import DiceRoller from './components/DiceRoller';
import { Loading, Toaster } from './components/ui';
import AccountButton from './cloud/AccountButton';
import { JoinPanel } from './cloud/Players';
import { Icon } from './components/Icon';
import { PageBoundary, lazyPage } from './components/lazyPage';

// The pages beyond the forces load on first visit, so the first screen doesn't wait for the map, the tracker and the rules.
const BattleWizard = lazyPage(() => import('./components/BattleWizard'));
const BooksPage = lazyPage(() => import('./components/BooksPage'));
const CampaignPage = lazyPage(() => import('./components/CampaignPage'));
const ListPage = lazyPage(() => import('./components/ListPage'));
const LedgerPage = lazyPage(() => import('./components/Ledger'));
const SettingsPage = lazyPage(() => import('./components/SettingsPage'));
const BattleTracker = lazyPage(() => import('./components/BattleTracker'));
const SideSheet = lazyPage(() => import('./components/SideSheet'));
const MissionLibrary = lazyPage(() => import('./components/MissionLibrary'));
const GuidePage = lazyPage(() => import('./components/GuidePage'));
const RulesPage = lazyPage(() => import('./components/RulesPage'));

const FORCE_PAGES = ['forces', 'force', 'unit', 'battle', 'list', 'ledger'];
const BATTLE_PAGES = ['tracker', 'sideSheet', 'missions'];
// On a phone these three fold into one "More" menu so the top bar stays on one line of links.
const MORE = [
  { page: 'settings', label: 'Settings', href: () => href.settings() },
  { page: 'rules', label: 'Rules', href: () => href.rules() },
  { page: 'guide', label: 'Guide', href: () => href.guide() },
];

function MoreMenu({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [page]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const here = MORE.find((m) => m.page === page);
  return (
    <div className="nav-more" ref={ref}>
      <a href="#" className={here || open ? 'active' : ''} aria-expanded={open} onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
        {here ? here.label : 'More'} ▾
      </a>
      {open && (
        <div className="nav-more-menu">
          {MORE.map((m) => (
            <a key={m.page} className={m.page === page ? 'active' : ''} href={m.href()} onClick={() => setOpen(false)}>
              {m.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const on = (pages: string[]) => pages.includes(route.page);
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href.forces()}>
          <span className="brand-sigil"><Icon name="g:holy-symbol" /></span>
          <span className="brand-name">
            Crusade <em>Dataslate</em>
          </span>
        </a>
        <nav>
          <a className={on(FORCE_PAGES) ? 'active' : ''} href={href.forces()}>
            Forces
          </a>
          <a className={on(BATTLE_PAGES) ? 'active' : ''} href={href.tracker()}>
            Battle
          </a>
          <a className={on(['campaign']) ? 'active' : ''} href={href.campaign()}>
            Nexus Wars
          </a>
          <a className={on(['books']) ? 'active' : ''} href={href.books()}>
            <span className="nav-long">Army </span>Books
          </a>
          {MORE.map((m) => (
            <a key={m.page} className={`nav-wide ${on([m.page]) ? 'active' : ''}`} href={m.href()}>
              {m.label}
            </a>
          ))}
          <MoreMenu page={route.page} />
        </nav>
        <nav className="nav-tools">
          <DiceRoller />
          <AccountButton />
        </nav>
      </header>
      <main className="content">
        <JoinPanel />
        <PageBoundary key={route.page}>
        <Suspense fallback={<Loading />}>
          {route.page === 'forces' && <ForceList />}
          {route.page === 'force' && <ForceView forceId={route.forceId} />}
          {route.page === 'unit' && <UnitSheet forceId={route.forceId} unitId={route.unitId} />}
          {route.page === 'battle' && <BattleWizard key={`${route.forceId}/${route.battleId}/${route.sideId}`} forceId={route.forceId} battleId={route.battleId} sideId={route.sideId} />}
          {route.page === 'list' && <ListPage forceId={route.forceId} listId={route.listId} />}
          {route.page === 'ledger' && <LedgerPage forceId={route.forceId} />}
          {route.page === 'tracker' && <BattleTracker key={`${route.sectorId}/${route.attacker}/${route.forceId}/${route.crisis}`} crisis={route.crisis} sectorId={route.sectorId} attacker={route.attacker} forceId={route.forceId} />}
          {route.page === 'sideSheet' && <SideSheet sideId={route.sideId} />}
          {route.page === 'missions' && <MissionLibrary />}
          {route.page === 'campaign' && <CampaignPage gm={!!route.gm} tab={route.tab} at={route.at} />}
          {route.page === 'books' && <BooksPage />}
          {route.page === 'settings' && <SettingsPage />}
          {route.page === 'rules' && <RulesPage sub={route.sub} />}
          {route.page === 'guide' && <GuidePage />}
        </Suspense>
        </PageBoundary>
      </main>
      <Toaster />
      <footer className="footer">++ Data lives in this browser and syncs with the group while you're signed in. ++</footer>
    </div>
  );
}
