import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppAuthProvider } from './lib/auth.js';
import { LobbyPage } from './routes/lobby-page.js';
import { RoomPage } from './routes/room-page.js';
import { readWebConfig } from './lib/config.js';

const config = readWebConfig();

const MissingConfiguration = () => (
  <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(203,173,96,0.28),_transparent_34%),linear-gradient(180deg,_#241711,_#0f1115)] px-3 py-3 text-stone-100 sm:px-4 sm:py-4">
    <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-[1.9rem] border border-white/10 bg-stone-950/76 p-6 shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur sm:p-8">
      <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">Splendor Web</p>
      <h1 className="font-serif text-4xl text-amber-50">Authentication configuration is missing</h1>
      <p className="max-w-2xl text-base leading-7 text-stone-300">
        Either enable <code>VITE_GUEST_AUTH_ENABLED=true</code> or set <code>VITE_AUTH0_DOMAIN</code>,
        <code> VITE_AUTH0_CLIENT_ID</code>, and <code>VITE_AUTH0_AUDIENCE</code> before starting the frontend.
      </p>
    </div>
  </main>
);

export const App = () => {
  if (!config.isAuthConfigured) {
    return <MissingConfiguration />;
  }

  return (
    <AppAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </BrowserRouter>
    </AppAuthProvider>
  );
};
