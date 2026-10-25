import { Suspense } from 'react';
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

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href.forces()}>
          <span className="brand-sigil"><Icon name="g:holy-symbol" /></span>
          <span>
            Crusade <em>Dataslate</em>
          </span>
        </a>
        <nav>
          <a className={route.page === 'forces' || route.page === 'force' || route.page === 'unit' || route.page === 'battle' || route.page === 'list' || route.page === 'ledger' ? 'active' : ''} href={href.forces()}>
            Forces
          </a>
          <a className={route.page === 'tracker' || route.page === 'sideSheet' || route.page === 'missions' ? 'active' : ''} href={href.tracker()}>
            Battle
          </a>
          <a className={route.page === 'campaign' ? 'active' : ''} href={href.campaign()}>
            Nexus Wars
          </a>
          <a className={route.page === 'books' ? 'active' : ''} href={href.books()}>
            Army Books
          </a>
          <a className={route.page === 'settings' ? 'active' : ''} href={href.settings()}>
            Settings
          </a>
          <a className={route.page === 'rules' ? 'active' : ''} href={href.rules()}>
            Rules
          </a>
          <a className={route.page === 'guide' ? 'active' : ''} href={href.guide()}>
            Guide
          </a>
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
