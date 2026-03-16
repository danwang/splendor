import { type Move } from '@splendor/game-engine';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RoomScene } from '../components/room-scene.js';
import { joinRoom, loadRoom, startRoom } from '../lib/api.js';
import { useAppAuth } from '../lib/auth.js';
import { connectToRoomSocket, sendSocketMessage } from '../lib/socket.js';
import { type PublicRoomState, type ServerMessage } from '../lib/types.js';

const reconnectDelayForAttempt = (attempt: number): number =>
  Math.min(1_000 * 2 ** attempt, 10_000);

export const RoomPage = () => {
  const { roomId = '' } = useParams();
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
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guestDisplayName, setGuestDisplayName] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const currentUserId = user?.id;

  useEffect(() => {
    if (!isAuthenticated || roomId.length === 0) {
      return;
    }

    let isCancelled = false;

    const load = async (): Promise<void> => {
      try {
        const token = await getAccessTokenSilently();
        const nextRoom = await loadRoom(token, roomId);

        if (!isCancelled) {
          setRoom(nextRoom);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load room.');
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [getAccessTokenSilently, isAuthenticated, roomId]);

  useEffect(() => {
    if (!isAuthenticated || roomId.length === 0) {
      return;
    }

    setIsSocketConnected(false);
    let isCancelled = false;
    let reconnectAttempt = 0;

    const clearReconnectTimer = (): void => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (isCancelled) {
        return;
      }

      clearReconnectTimer();
      const delayMs = reconnectDelayForAttempt(reconnectAttempt);
      reconnectAttempt += 1;
      setErrorMessage('Connection lost. Reconnecting…');
      reconnectTimerRef.current = window.setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async (): Promise<void> => {
      try {
        const token = await getAccessTokenSilently();

        if (isCancelled) {
          return;
        }

        const socket = connectToRoomSocket(
          roomId,
          token,
          () => {
            reconnectAttempt = 0;
            setIsSocketConnected(true);
            setErrorMessage(null);
          },
          (message: ServerMessage) => {
            if (message.type === 'room-state') {
              setRoom(message.room);
              setErrorMessage(null);
              return;
            }

            setErrorMessage(message.message);
          },
          () => {
            socketRef.current = null;
            setIsSocketConnected(false);
            scheduleReconnect();
          },
        );

        socketRef.current = socket;
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to connect to room.',
          );
          scheduleReconnect();
        }
      }
    };

    void connect();

    return () => {
      isCancelled = true;
      clearReconnectTimer();
      setIsSocketConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [getAccessTokenSilently, isAuthenticated, roomId]);

  const submitMove = (move: Move): void => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setErrorMessage('The room socket is not connected yet.');
      return;
    }

    sendSocketMessage(socketRef.current, {
      type: 'submit-move',
      move,
    });
  };

  const handleJoinRoom = async (): Promise<void> => {
    try {
      setIsWorking(true);
      setErrorMessage(null);
      const token = await getAccessTokenSilently();
      const nextRoom = await joinRoom(token, roomId);

      setRoom(nextRoom);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to join room.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleStartGame = async (): Promise<void> => {
    try {
      setIsWorking(true);
      setErrorMessage(null);
      const token = await getAccessTokenSilently();
      const nextRoom = await startRoom(token, roomId);

      setRoom(nextRoom);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start room.');
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-stone-950 text-stone-100" />;
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_24%),linear-gradient(180deg,_#1d120d,_#070b14)] px-3 py-3 text-stone-100 sm:px-4 sm:py-4">
        <div className="mx-auto max-w-xl rounded-[1.9rem] border border-white/10 bg-stone-950/76 p-6 text-center shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur sm:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">Room Access</p>
          <h1 className="mt-4 font-serif text-4xl text-amber-50">
            {isGuestAuthEnabled ? `Enter your name to open room ${roomId}` : `Sign in to open room ${roomId}`}
          </h1>
          <p className="mt-3 text-sm leading-7 text-stone-300">
            This room is real-time and authoritative, so you need an identity before subscribing to the board state.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {isGuestAuthEnabled ? (
              <>
                <input
                  className="w-full max-w-xs rounded-full border border-white/12 bg-white/5 px-4 py-3 text-stone-100 outline-none transition focus:border-amber-300/40 focus:bg-white/7"
                  onChange={(event) => setGuestDisplayName(event.target.value)}
                  placeholder="Your name"
                  value={guestDisplayName}
                />
                <button
                  className="rounded-full bg-amber-300 px-5 py-3 font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                  disabled={guestDisplayName.trim().length === 0}
                  onClick={() => signInAsGuest(guestDisplayName)}
                  type="button"
                >
                  Continue as guest
                </button>
              </>
            ) : (
              <button
                className="rounded-full bg-amber-300 px-5 py-3 font-medium text-stone-950 transition hover:bg-amber-200"
                onClick={() => {
                  void loginWithRedirect();
                }}
                type="button"
              >
                {isDevBypassEnabled ? 'Quick sign in' : 'Sign in'}
              </button>
            )}
            {isDevBypassEnabled ? (
              <div className="flex flex-wrap justify-center gap-2">
                {devProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    className="rounded-full border border-sky-200/15 px-3 py-2 text-left text-xs text-sky-100 transition hover:border-sky-200/35 hover:bg-sky-100/5"
                    onClick={() => signInAsDevProfile(profile.id)}
                    type="button"
                  >
                    {profile.displayName}
                  </button>
                ))}
              </div>
            ) : null}
            <Link
              className="rounded-full border border-white/12 bg-white/5 px-5 py-3 text-stone-100 transition hover:border-white/20 hover:bg-white/8"
              to="/"
            >
              Back to lobby
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <RoomScene
      currentUserId={currentUserId}
      devProfiles={devProfiles}
      errorMessage={errorMessage}
      isDevBypassEnabled={isDevBypassEnabled}
      isSocketConnected={isSocketConnected}
      isWorking={isWorking}
      onJoinRoom={() => {
        void handleJoinRoom();
      }}
      onLogout={() => logout()}
      onSelectDevProfile={signInAsDevProfile}
      onStartGame={() => {
        void handleStartGame();
      }}
      onSubmitMove={submitMove}
      room={room}
      roomId={roomId}
      user={user}
    />
  );
};
