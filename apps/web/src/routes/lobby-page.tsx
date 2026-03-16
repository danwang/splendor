import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createRoom, listRooms } from '../lib/api.js';
import { useAppAuth } from '../lib/auth.js';
import { type PublicRoomSummary, type RoomConfig } from '../lib/types.js';

const targetScores = [15, 16, 17, 18, 19, 20, 21] as const;
const seatCounts = [2, 3, 4] as const;
const roomPollIntervalMs = 5_000;

const shellClass =
  'rounded-[1.8rem] border border-white/10 bg-stone-950/72 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur sm:p-6';

const fieldClass =
  'w-full rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3.5 pr-6 text-stone-100 outline-none transition focus:border-amber-300/50 focus:bg-white/7';

const statusPillClass: Readonly<Record<PublicRoomSummary['status'], string>> = {
  waiting: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  in_progress: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  finished: 'border-stone-300/20 bg-stone-300/10 text-stone-300',
};

const roomStatusLabel = (status: PublicRoomSummary['status']): string => {
  if (status === 'in_progress') {
    return 'In progress';
  }

  if (status === 'finished') {
    return 'Finished';
  }

  return 'Open';
};

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
  const [rooms, setRooms] = useState<readonly PublicRoomSummary[]>([]);
  const [roomListError, setRoomListError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGuestAuthEnabled || isAuthenticated) {
      return;
    }

    setGuestDisplayName(user?.displayName ?? '');
  }, [isAuthenticated, isGuestAuthEnabled, user?.displayName]);

  useEffect(() => {
    let isCancelled = false;

    const loadRooms = async (): Promise<void> => {
      try {
        const nextRooms = await listRooms();

        if (!isCancelled) {
          setRooms(nextRooms);
          setRoomListError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRoomListError(
            error instanceof Error ? error.message : 'Failed to load discoverable rooms.',
          );
        }
      }
    };

    void loadRooms();
    const intervalHandle = window.setInterval(() => {
      void loadRooms();
    }, roomPollIntervalMs);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalHandle);
    };
  }, []);

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
          <h1 className="font-serif text-4xl leading-none text-amber-50 sm:text-5xl">
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
            ) : !isGuestAuthEnabled ? (
              <button
                className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                onClick={() => {
                  void loginWithRedirect();
                }}
                type="button"
              >
                {isDevBypassEnabled ? 'Quick sign in' : 'Sign in'}
              </button>
            ) : null}
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

        {isGuestAuthEnabled && !isAuthenticated ? (
          <section className={shellClass}>
            <p className="text-xs uppercase tracking-[0.32em] text-amber-300/70">Step 1</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className={`${fieldClass} sm:max-w-sm`}
                onChange={(event) => setGuestDisplayName(event.target.value)}
                placeholder="Enter your name"
                value={guestDisplayName}
              />
              <button
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                disabled={guestDisplayName.trim().length === 0}
                onClick={() => signInAsGuest(guestDisplayName)}
                type="button"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[1.4rem] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className={shellClass}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.32em] text-emerald-300/70">
                Discover rooms
              </p>
              <span className="text-xs text-stone-500">Refreshes automatically</span>
            </div>
            {roomListError ? (
              <p className="mt-4 rounded-[1rem] border border-rose-400/15 bg-rose-400/8 px-3 py-2 text-sm text-rose-100">
                {roomListError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2.5">
              {rooms.length > 0 ? (
                rooms.map((room) => (
                  <Link
                    key={room.id}
                    className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/15 hover:bg-white/[0.05]"
                    to={`/rooms/${room.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-stone-100">
                          {room.id.slice(0, 8).toUpperCase()}
                        </div>
                        <div className="mt-1 text-xs text-stone-400">
                          {room.participants.length}/{room.config.seatCount} players • target{' '}
                          {room.config.targetScore}
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          statusPillClass[room.status]
                        }`}
                      >
                        {roomStatusLabel(room.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {room.participants.map((participant) => (
                        <span
                          key={`${room.id}-${participant.userId}`}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-stone-300"
                        >
                          {participant.displayName}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-stone-400">
                  No public rooms yet. Create one to get the table started.
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-4">
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
          </div>
        </section>
      </div>
    </main>
  );
};
