import { type Move } from '@splendor/game-engine';
import { type FastifyInstance } from 'fastify';

import { clientMessageSchema } from './protocol.js';
import { applyRoomMove, toPublicRoomState } from '../services/game-service.js';
import { type AuthenticatedUser, type RoomRecord, type ServerMessage } from '../types.js';

export interface SocketLike {
  readonly send: (payload: string) => void;
  readonly close: () => void;
  readonly on: {
    (event: 'message', listener: (payload: { readonly toString: () => string }) => void): void;
    (event: 'close', listener: () => void): void;
  };
}

const parseSocketMessage = (raw: string) => {
  try {
    return clientMessageSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

const sendMessage = (socket: SocketLike, message: ServerMessage): void => {
  socket.send(JSON.stringify(message));
};

export const broadcastRoomState = (
  connections: Map<string, Set<SocketLike>>,
  roomId: string,
  room: RoomRecord,
): void => {
  const message: ServerMessage = {
    type: 'room-state',
    room: toPublicRoomState(room),
  };

  (connections.get(roomId) ?? new Set()).forEach((socket) => {
    sendMessage(socket, message);
  });
};

export const submitRoomMoveFromSocket = async (
  app: FastifyInstance,
  connections: Map<string, Set<SocketLike>>,
  roomId: string,
  user: AuthenticatedUser,
  move: Move,
  replySocket: SocketLike,
): Promise<void> => {
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
  broadcastRoomState(connections, roomId, moveResult.room);
};

export const registerGameSocket = (
  app: FastifyInstance,
  connections: Map<string, Set<SocketLike>>,
  authenticateSocket: (token: string | undefined) => Promise<AuthenticatedUser>,
): void => {
  app.get(
    '/ws/rooms/:roomId',
    { websocket: true },
    async (connection, request) => {
      const roomId = (request.params as { roomId: string }).roomId;
      const token = (request.query as { token?: string }).token;

      try {
        const user = await authenticateSocket(token);
        const room = await app.serverDependencies.roomStore.getRoom(roomId);

        if (!room) {
          sendMessage(connection.socket, {
            type: 'error',
            message: 'Room not found.',
          });
          connection.socket.close();
          return;
        }

        const roomConnections = connections.get(roomId) ?? new Set();

        roomConnections.add(connection.socket);
        connections.set(roomId, roomConnections);
        sendMessage(connection.socket, {
          type: 'room-state',
          room: toPublicRoomState(room),
        });

        connection.socket.on('message', async (raw: { readonly toString: () => string }) => {
          const parsed = parseSocketMessage(raw.toString());

          if (!parsed) {
            sendMessage(connection.socket, {
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
            connection.socket,
          );
        });

        connection.socket.on('close', () => {
          const sockets = connections.get(roomId);

          if (!sockets) {
            return;
          }

          sockets.delete(connection.socket);

          if (sockets.size === 0) {
            connections.delete(roomId);
          }
        });
      } catch (error) {
        sendMessage(connection.socket, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unauthorized websocket connection.',
        });
        connection.socket.close();
      }
    },
  );
};
