import { href, useRoute } from './route';
import ForceList from './components/ForceList';
import ForceView from './components/ForceView';
import UnitSheet from './components/UnitSheet';
import BattleWizard from './components/BattleWizard';
import DiceRoller from './components/DiceRoller';
import BooksPage from './components/BooksPage';
import SettingsPage from './components/SettingsPage';
import { Toaster } from './components/ui';

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
          <a className={route.page === 'forces' || route.page === 'force' || route.page === 'unit' || route.page === 'battle' ? 'active' : ''} href={href.forces()}>
            Forces
          </a>
          <a className={route.page === 'books' ? 'active' : ''} href={href.books()}>
            Army Books
          </a>
          <a className={route.page === 'settings' ? 'active' : ''} href={href.settings()}>
            Settings
          </a>
          <DiceRoller />
        </nav>
      </header>
      <main className="content">
        {route.page === 'forces' && <ForceList />}
        {route.page === 'force' && <ForceView forceId={route.forceId} />}
        {route.page === 'unit' && <UnitSheet forceId={route.forceId} unitId={route.unitId} />}
        {route.page === 'battle' && <BattleWizard key={route.forceId} forceId={route.forceId} />}
        {route.page === 'books' && <BooksPage />}
        {route.page === 'settings' && <SettingsPage />}
      </main>
      <Toaster />
      <footer className="footer">++ Data persists in this browser. Export forces to share them via Drive. ++</footer>
    </div>
  );
}
