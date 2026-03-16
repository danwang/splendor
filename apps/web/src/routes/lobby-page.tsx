import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createRoom } from '../lib/api.js';
import { useAppAuth } from '../lib/auth.js';
import { type RoomConfig } from '../lib/types.js';

const targetScores = [15, 16, 17, 18, 19, 20, 21] as const;
const seatCounts = [2, 3, 4] as const;

const shellClass =
  'rounded-[1.8rem] border border-white/10 bg-stone-950/72 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur sm:p-6';

const fieldClass =
  'w-full rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3.5 pr-6 text-stone-100 outline-none transition focus:border-amber-300/50 focus:bg-white/7';

export const LobbyPage = () => {
  const navigate = useNavigate();
  const {
    devProfiles,
    getAccessTokenSilently,
    isAuthenticated,
    isDevBypassEnabled,
    isGuestAuthEnabled,
    isLoading,
    loginWithRedirect,
    logout,
    signInAsGuest,
    signInAsDevProfile,
    user,
  } = useAppAuth();
  const [roomConfig, setRoomConfig] = useState<RoomConfig>({
    seatCount: 2,
    targetScore: 15,
  });
  const [roomIdToJoin, setRoomIdToJoin] = useState('');
  const [guestDisplayName, setGuestDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateRoom = async (): Promise<void> => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const token = await getAccessTokenSilently();
      const room = await createRoom(token, roomConfig);

      navigate(`/rooms/${room.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-stone-950 text-stone-100" />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.15),_transparent_28%),linear-gradient(180deg,_#20140f,_#090d15)] px-3 py-3 text-stone-100 sm:px-4 sm:py-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className={shellClass}>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-none text-amber-50 sm:text-5xl">
            Splerdon
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {isAuthenticated ? (
              <>
                <div className="rounded-full border border-white/10 bg-white/4 px-3 py-2 text-sm text-stone-200">
                  {user?.displayName ?? user?.email}
                </div>
                <button
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-medium text-stone-100 transition hover:border-white/20 hover:bg-white/8"
                  onClick={() => logout()}
                  type="button"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                {isGuestAuthEnabled ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      className="rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-300/40 focus:bg-white/7"
                      onChange={(event) => setGuestDisplayName(event.target.value)}
                      placeholder="Your name"
                      value={guestDisplayName}
                    />
                    <button
                      className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                      disabled={guestDisplayName.trim().length === 0}
                      onClick={() => signInAsGuest(guestDisplayName)}
                      type="button"
                    >
                      Continue as guest
                    </button>
                  </div>
                ) : (
                  <button
                    className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                    onClick={() => {
                      void loginWithRedirect();
                    }}
                    type="button"
                  >
                    {isDevBypassEnabled ? 'Quick sign in' : 'Sign in'}
                  </button>
                )}
              </>
            )}
          </div>
          {isDevBypassEnabled ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {devProfiles.map((profile) => (
                <button
                  key={profile.id}
                  className="rounded-full border border-sky-200/15 px-3 py-2 text-xs text-sky-100 transition hover:border-sky-200/35 hover:bg-sky-100/5"
                  onClick={() => signInAsDevProfile(profile.id)}
                  type="button"
                >
                  {profile.displayName}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {errorMessage ? (
          <div className="rounded-[1.4rem] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className={shellClass}>
            <p className="text-xs uppercase tracking-[0.32em] text-amber-300/70">Create room</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2.5">
                <span className="text-sm text-stone-300">Seat count</span>
                <select
                  className={fieldClass}
                  onChange={(event) =>
                    setRoomConfig((current) => ({
                      ...current,
                      seatCount: Number(event.target.value) as RoomConfig['seatCount'],
                    }))
                  }
                  value={roomConfig.seatCount}
                >
                  {seatCounts.map((seatCount) => (
                    <option key={seatCount} value={seatCount}>
                      {seatCount} players
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2.5">
                <span className="text-sm text-stone-300">Target score</span>
                <select
                  className={fieldClass}
                  onChange={(event) =>
                    setRoomConfig((current) => ({
                      ...current,
                      targetScore: Number(event.target.value) as RoomConfig['targetScore'],
                    }))
                  }
                  value={roomConfig.targetScore}
                >
                  {targetScores.map((targetScore) => (
                    <option key={targetScore} value={targetScore}>
                      {targetScore} points
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                disabled={!isAuthenticated || isSubmitting}
                onClick={() => {
                  void handleCreateRoom();
                }}
                type="button"
              >
                {isSubmitting
                  ? 'Creating…'
                  : !isAuthenticated && isGuestAuthEnabled
                    ? 'Create your name first'
                    : !isAuthenticated
                      ? 'Sign in first'
                      : 'Create room'}
              </button>
              {!isAuthenticated && !isGuestAuthEnabled ? (
                <button
                  className="rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-medium text-stone-100 transition hover:border-white/20 hover:bg-white/8"
                  onClick={() => {
                    void loginWithRedirect();
                  }}
                  type="button"
                >
                  Sign in first
                </button>
              ) : null}
            </div>
          </section>

          <section className={shellClass}>
            <p className="text-xs uppercase tracking-[0.32em] text-sky-300/70">Join room</p>
            <label className="mt-4 flex flex-col gap-2.5">
              <span className="text-sm text-stone-300">Room ID</span>
              <input
                className={fieldClass}
                onChange={(event) => setRoomIdToJoin(event.target.value)}
                placeholder="Paste a room id"
                value={roomIdToJoin}
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
                to={roomIdToJoin.length > 0 ? `/rooms/${roomIdToJoin}` : '/'}
              >
                Open room
              </Link>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
};
