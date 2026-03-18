import { type Move } from '@splendor/game-engine';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RoomScene } from '../components/room-scene.js';
import { bootRoomParticipant, joinRoom, loadRoom, startRoom } from '../lib/api.js';
import { useAppAuth } from '../lib/auth.js';
import { connectToRoomSocket, sendSocketMessage } from '../lib/socket.js';
import { type PublicRoomState, type ServerMessage } from '../lib/types.js';

const reconnectDelayForAttempt = (attempt: number): number =>
  Math.min(1_000 * 2 ** attempt, 10_000);

const mergeRoomHistory = (
  history: readonly PublicRoomState[],
  nextRoom: PublicRoomState | null,
  limit = 180,
): readonly PublicRoomState[] => {
  if (!nextRoom) {
    return history;
  }

  const sameRoomHistory = history.filter((room) => room.id === nextRoom.id);
  const byVersion = new Map<number, PublicRoomState>(
    sameRoomHistory.map((room) => [room.stateVersion, room]),
  );
  byVersion.set(nextRoom.stateVersion, nextRoom);

  return [...byVersion.values()]
    .sort((left, right) => left.stateVersion - right.stateVersion)
    .slice(-limit);
};

export const RoomPage = () => {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isGuestAuthEnabled,
    isLoading,
    loginWithRedirect,
    logout,
    signInAsGuest,
    user,
  } = useAppAuth();
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [roomHistory, setRoomHistory] = useState<readonly PublicRoomState[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guestDisplayName, setGuestDisplayName] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const socketAttemptRef = useRef(0);
  const currentUserId = user?.id;
  const isJoinedParticipant =
    room !== null && room.participants.some((participant) => participant.userId === currentUserId);
  const commitRoom = (nextRoom: PublicRoomState | null): void => {
    setRoom(nextRoom);
    setRoomHistory((current) => mergeRoomHistory(current, nextRoom));
  };

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
          commitRoom(nextRoom);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!isCancelled) {
          if (error instanceof Error && error.message === 'Room not found.') {
            navigate('/', { replace: true });
            return;
          }

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
    if (!isAuthenticated || roomId.length === 0 || !isJoinedParticipant) {
      return;
    }

    console.debug('[room-socket] effect:start', {
      roomId,
      currentUserId,
      isJoinedParticipant,
    });
    setIsSocketConnected(false);
    let isCancelled = false;
    let shouldReconnect = true;
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
      console.debug('[room-socket] reconnect:scheduled', {
        roomId,
        currentUserId,
        reconnectAttempt,
        delayMs,
      });
      setErrorMessage('Connection lost. Reconnecting…');
      reconnectTimerRef.current = window.setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async (): Promise<void> => {
      try {
        socketAttemptRef.current += 1;
        const attempt = socketAttemptRef.current;
        const token = await getAccessTokenSilently();

        if (isCancelled) {
          return;
        }

        console.debug('[room-socket] connect:begin', {
          roomId,
          currentUserId,
          attempt,
          reconnectAttempt,
        });

        const socket = connectToRoomSocket(
          roomId,
          token,
          () => {
            reconnectAttempt = 0;
            console.debug('[room-socket] open', {
              roomId,
              currentUserId,
              attempt,
            });
            setIsSocketConnected(true);
            setErrorMessage(null);
          },
          (message: ServerMessage) => {
            console.debug('[room-socket] message', {
              roomId,
              currentUserId,
              attempt,
              type: message.type,
            });
            if (message.type === 'room-state') {
              setRoom(message.room);
              setRoomHistory((current) => mergeRoomHistory(current, message.room));
              setErrorMessage(null);
              return;
            }

            if (message.message === 'Room not found.') {
              navigate('/', { replace: true });
              return;
            }

            setErrorMessage(message.message);
          },
          (event: CloseEvent) => {
            console.debug('[room-socket] close', {
              roomId,
              currentUserId,
              attempt,
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
              shouldReconnect,
            });
            socketRef.current = null;
            setIsSocketConnected(false);
            if (shouldReconnect) {
              scheduleReconnect();
            }
          },
          () => {
            console.debug('[room-socket] error', {
              roomId,
              currentUserId,
              attempt,
            });
          },
        );

        socketRef.current = socket;
      } catch (error) {
        if (!isCancelled) {
          console.debug('[room-socket] connect:failed', {
            roomId,
            currentUserId,
            error: error instanceof Error ? error.message : 'unknown',
          });
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to connect to room.',
          );
          scheduleReconnect();
        }
      }
    };

    void connect();

    return () => {
      console.debug('[room-socket] effect:cleanup', {
        roomId,
        currentUserId,
      });
      isCancelled = true;
      shouldReconnect = false;
      clearReconnectTimer();
      setIsSocketConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [getAccessTokenSilently, isAuthenticated, isJoinedParticipant, roomId]);

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

      commitRoom(nextRoom);
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

      commitRoom(nextRoom);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start room.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleBootParticipant = async (userId: string): Promise<void> => {
    try {
      setIsWorking(true);
      setErrorMessage(null);
      const token = await getAccessTokenSilently();
      const nextRoom = await bootRoomParticipant(token, roomId, userId);

      commitRoom(nextRoom);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to remove player.');
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
                Sign in
              </button>
            )}
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
      errorMessage={errorMessage}
      isSocketConnected={isSocketConnected}
      isWorking={isWorking}
      onBootParticipant={(userId) => {
        void handleBootParticipant(userId);
      }}
      onJoinRoom={() => {
        void handleJoinRoom();
      }}
      onLogout={() => logout()}
      onStartGame={() => {
        void handleStartGame();
      }}
      onSubmitMove={submitMove}
      room={room}
      roomHistory={roomHistory}
      roomId={roomId}
      user={user}
    />
  );
};
