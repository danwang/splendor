import { type Move } from '@splendor/game-engine';
import { type FastifyInstance } from 'fastify';

import { clientMessageSchema } from './protocol.js';
import { applyRoomMove, toPublicRoomState, withConnectedUserIds } from '../services/game-service.js';
import { type AuthenticatedUser, type RoomRecord, type ServerMessage } from '../types.js';

export interface SocketLike {
  readonly send: (payload: string) => void;
  readonly close: () => void;
  readonly on: {
    (event: 'message', listener: (payload: { readonly toString: () => string }) => void): void;
    (event: 'close', listener: () => void): void;
  };
}

type SocketConnection = SocketLike | { readonly socket?: SocketLike };

const parseSocketMessage = (raw: string) => {
  try {
    return clientMessageSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

const resolveSocket = (connection: SocketConnection): SocketLike | null => {
  if ('send' in connection && typeof connection.send === 'function') {
    return connection;
  }

  if ('socket' in connection && connection.socket) {
    return connection.socket;
  }

  return null;
};

const sendMessage = (socket: SocketLike, message: ServerMessage): boolean => {
  try {
    console.debug('[server-room-socket] send', {
      type: message.type,
      ...(message.type === 'room-state'
        ? {
            roomId: message.room.id,
            stateVersion: message.room.stateVersion,
            historyLength: message.roomHistory.length,
            connectedUserIds: message.room.connectedUserIds,
          }
        : {
            message: message.message,
          }),
    });
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.debug('[server-room-socket] send:failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
};

const getConnectedUserIds = (
  connections: Map<string, Map<SocketLike, string>>,
  roomId: string,
): readonly string[] => [...new Set([...(connections.get(roomId)?.values() ?? [])])];

export const broadcastRoomState = (
  connections: Map<string, Map<SocketLike, string>>,
  roomId: string,
  room: RoomRecord,
): void => {
  const message: ServerMessage = {
    type: 'room-state',
    room: withConnectedUserIds(toPublicRoomState(room), getConnectedUserIds(connections, roomId)),
    roomHistory: room.history,
  };

  const roomConnections = connections.get(roomId) ?? new Map();

  roomConnections.forEach((_, socket) => {
    const sent = sendMessage(socket, message);

    if (!sent) {
      roomConnections.delete(socket);
    }
  });

  if (roomConnections.size === 0) {
    connections.delete(roomId);
  } else {
    connections.set(roomId, roomConnections);
  }
};

export const submitRoomMoveFromSocket = async (
  app: FastifyInstance,
  connections: Map<string, Map<SocketLike, string>>,
  roomId: string,
  user: AuthenticatedUser,
  move: Move,
  replySocket: SocketLike,
): Promise<void> => {
  console.debug('[server-room-socket] move:received', {
    roomId,
    userId: user.id,
    moveType: move.type,
  });
  const currentRoom = await app.serverDependencies.roomStore.getRoom(roomId);

  if (!currentRoom) {
    sendMessage(replySocket, {
      type: 'error',
      message: 'Room not found.',
    });
    return;
  }

  const moveResult = applyRoomMove(currentRoom, user, move);

  if (!moveResult.ok) {
    sendMessage(replySocket, {
      type: 'error',
      message: moveResult.message,
    });
    return;
  }

  await app.serverDependencies.roomStore.updateRoom(moveResult.room);
  const persistedRoom = await app.serverDependencies.roomStore.getRoom(roomId);

  if (!persistedRoom) {
    sendMessage(replySocket, {
      type: 'error',
      message: 'Room not found.',
    });
    return;
  }

  broadcastRoomState(connections, roomId, persistedRoom);
};

export const registerGameSocket = (
  app: FastifyInstance,
  connections: Map<string, Map<SocketLike, string>>,
  authenticateSocket: (token: string | undefined) => Promise<AuthenticatedUser>,
): void => {
  app.get(
    '/ws/rooms/:roomId',
    { websocket: true },
    async (connection, request) => {
      const socket = resolveSocket(connection);
      const roomId = (request.params as { roomId: string }).roomId;
      const token = (request.query as { token?: string }).token;

      try {
        console.debug('[server-room-socket] connect:begin', {
          roomId,
          hasToken: Boolean(token),
        });

        if (!socket) {
          throw new Error('Websocket connection missing socket instance.');
        }

        const user = await authenticateSocket(token);
        const room = await app.serverDependencies.roomStore.getRoom(roomId);

        if (!room) {
          sendMessage(socket, {
            type: 'error',
            message: 'Room not found.',
          });
          socket.close();
          return;
        }

        const roomConnections = connections.get(roomId) ?? new Map();

        roomConnections.set(socket, user.id);
        connections.set(roomId, roomConnections);
        console.debug('[server-room-socket] connect:open', {
          roomId,
          userId: user.id,
          connectedUserIds: getConnectedUserIds(connections, roomId),
        });
        broadcastRoomState(connections, roomId, room);

        socket.on('message', async (raw: { readonly toString: () => string }) => {
          const parsed = parseSocketMessage(raw.toString());

          if (!parsed) {
            sendMessage(socket, {
              type: 'error',
              message: 'Invalid websocket message.',
            });
            return;
          }

          await submitRoomMoveFromSocket(
            app,
            connections,
            roomId,
            user,
            parsed.move as Move,
            socket,
          );
        });

        socket.on('close', () => {
          console.debug('[server-room-socket] close', {
            roomId,
            userId: user.id,
          });
          const sockets = connections.get(roomId);

          if (!sockets) {
            return;
          }

          sockets.delete(socket);

          if (sockets.size === 0) {
            connections.delete(roomId);
          } else if (room) {
            broadcastRoomState(connections, roomId, room);
          }
        });
      } catch (error) {
        console.debug('[server-room-socket] connect:failed', {
          roomId,
          error: error instanceof Error ? error.message : 'unknown',
        });
        if (socket) {
          sendMessage(socket, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unauthorized websocket connection.',
          });
          socket.close();
        }
      }
    },
  );
};
