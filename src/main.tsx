import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './model/store';
import { CloudProvider } from './cloud/CloudSync';
import App from './App';
import { TooltipProvider } from './components/Tooltip';
import { reloadForNewDeploy } from './components/lazyPage';
import './styles.css';

// A file a page preloads is gone after a new deploy: reload once to fetch the new ones.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewDeploy()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <CloudProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </CloudProvider>
    </StoreProvider>
  </StrictMode>,
);
