import { lazy, Suspense } from 'react';
import { href, useRoute } from './route';
import ForceList from './components/ForceList';
import ForceView from './components/ForceView';
import UnitSheet from './components/UnitSheet';
import DiceRoller from './components/DiceRoller';
import { Loading, Toaster } from './components/ui';
import AccountButton from './cloud/AccountButton';
import { JoinPanel } from './cloud/Players';
import { Icon } from './components/Icon';

// The pages beyond the forces load on first visit, so the first screen doesn't wait for the map, the tracker and the rules.
const BattleWizard = lazy(() => import('./components/BattleWizard'));
const BooksPage = lazy(() => import('./components/BooksPage'));
const CampaignPage = lazy(() => import('./components/CampaignPage'));
const ListPage = lazy(() => import('./components/ListPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const BattleTracker = lazy(() => import('./components/BattleTracker'));
const SideSheet = lazy(() => import('./components/SideSheet'));
const MissionLibrary = lazy(() => import('./components/MissionLibrary'));
const GuidePage = lazy(() => import('./components/GuidePage'));
const RulesPage = lazy(() => import('./components/RulesPage'));

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
          <a className={route.page === 'forces' || route.page === 'force' || route.page === 'unit' || route.page === 'battle' || route.page === 'list' ? 'active' : ''} href={href.forces()}>
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
        <Suspense fallback={<Loading />}>
          {route.page === 'forces' && <ForceList />}
          {route.page === 'force' && <ForceView forceId={route.forceId} />}
          {route.page === 'unit' && <UnitSheet forceId={route.forceId} unitId={route.unitId} />}
          {route.page === 'battle' && <BattleWizard key={`${route.forceId}/${route.battleId}/${route.sideId}`} forceId={route.forceId} battleId={route.battleId} sideId={route.sideId} />}
          {route.page === 'list' && <ListPage forceId={route.forceId} listId={route.listId} />}
          {route.page === 'tracker' && <BattleTracker key={`${route.sectorId}/${route.attacker}/${route.forceId}/${route.crisis}`} crisis={route.crisis} sectorId={route.sectorId} attacker={route.attacker} forceId={route.forceId} />}
          {route.page === 'sideSheet' && <SideSheet sideId={route.sideId} />}
          {route.page === 'missions' && <MissionLibrary />}
          {route.page === 'campaign' && <CampaignPage gm={!!route.gm} tab={route.tab} at={route.at} />}
          {route.page === 'books' && <BooksPage />}
          {route.page === 'settings' && <SettingsPage />}
          {route.page === 'rules' && <RulesPage sub={route.sub} />}
          {route.page === 'guide' && <GuidePage />}
        </Suspense>
      </main>
      <Toaster />
      <footer className="footer">++ Data is kept in this browser, and shared with the other players while you're signed in. ++</footer>
    </div>
  );
}
