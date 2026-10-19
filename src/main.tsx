import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './model/store';
import { CloudProvider } from './cloud/CloudSync';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <CloudProvider>
        <App />
      </CloudProvider>
    </StoreProvider>
  </StrictMode>,
);
