import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { updates } from './app/updates';
import './index.css';

const CHECK_FOR_UPDATE_MS = 30 * 60 * 1000;

const applyUpdate = registerSW({
  onNeedRefresh() {
    updates.ready(() => void applyUpdate(true));
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // An installed game can stay open in the background for days, so look for
    // a new version whenever it comes back to the front, and every half hour.
    const check = () => void registration.update().catch(() => undefined);
    setInterval(check, CHECK_FOR_UPDATE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
