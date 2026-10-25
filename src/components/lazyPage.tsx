import { Component, lazy, type ComponentType, type ReactNode } from 'react';

// A new deploy renames the code files a page loads on first visit, so a tab opened before it asks for files that are
// gone. Reloading once fetches the new ones; a second failure soon after is shown instead of reloading in a loop.
const KEY = 'chunkReloadAt';
const QUIET_MS = 15_000;

/** Reloads the app to pick up a new deploy, unless it just did; says whether it will. */
export function reloadForNewDeploy(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < QUIET_MS) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return true;
}

/** React.lazy that reloads the app once when the page's code fails to load. */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((err) => {
    if (reloadForNewDeploy()) return new Promise<never>(() => {});
    throw err;
  }));
}

/** Shows a page that failed to load (or crashed) with a Reload button, instead of a blank screen. */
export class PageBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel empty">
        <p>This page didn’t load. The app may have just been updated, or the connection dropped.</p>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        <p className="muted small">{this.state.error.message}</p>
      </div>
    );
  }
}
