import { href, useRoute } from './route';
import ForceList from './components/ForceList';
import ForceView from './components/ForceView';
import UnitSheet from './components/UnitSheet';
import BattleWizard from './components/BattleWizard';
import DiceRoller from './components/DiceRoller';
import BooksPage from './components/BooksPage';
import CampaignPage from './components/CampaignPage';
import ListPage from './components/ListPage';
import SettingsPage from './components/SettingsPage';
import { Toaster } from './components/ui';
import AccountButton from './cloud/AccountButton';

export default function App() {
  const route = useRoute();
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href.forces()}>
          <span className="brand-sigil">✠</span>
          <span>
            Crusade <em>Dataslate</em>
          </span>
        </a>
        <nav>
          <a className={route.page === 'forces' || route.page === 'force' || route.page === 'unit' || route.page === 'battle' || route.page === 'list' ? 'active' : ''} href={href.forces()}>
            Forces
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
          <DiceRoller />
          <AccountButton />
        </nav>
      </header>
      <main className="content">
        {route.page === 'forces' && <ForceList />}
        {route.page === 'force' && <ForceView forceId={route.forceId} />}
        {route.page === 'unit' && <UnitSheet forceId={route.forceId} unitId={route.unitId} />}
        {route.page === 'battle' && <BattleWizard key={route.forceId} forceId={route.forceId} />}
        {route.page === 'list' && <ListPage forceId={route.forceId} listId={route.listId} />}
        {route.page === 'campaign' && <CampaignPage />}
        {route.page === 'books' && <BooksPage />}
        {route.page === 'settings' && <SettingsPage />}
      </main>
      <Toaster />
      <footer className="footer">++ Data is kept in this browser, and shared with the other players while you're signed in. ++</footer>
    </div>
  );
}
