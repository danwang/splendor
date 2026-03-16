import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  joinRoom,
  startRoomGame,
  toPublicRoomState,
  toPublicRoomSummary,
} from '../services/game-service.js';
import { type AuthenticatedUser } from '../types.js';

const createRoomSchema = z.object({
  seatCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  targetScore: z.union([
    z.literal(15),
    z.literal(16),
    z.literal(17),
    z.literal(18),
    z.literal(19),
    z.literal(20),
    z.literal(21),
  ]),
});

const getBearerToken = (request: FastifyRequest): string | null => {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer (.+)$/);
  return match?.[1] ?? null;
};

const authenticateRequest = async (
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<AuthenticatedUser> => {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error('Missing bearer token.');
  }

  return app.serverDependencies.verifyAccessToken(token);
};

export const registerRoomRoutes = (app: FastifyInstance): void => {
  app.get('/api/rooms', async () => {
    const rooms = await app.serverDependencies.roomStore.listRooms();

    return {
      rooms: rooms
        .filter((room) => (room.game ? room.game.status !== 'finished' : true))
        .map(toPublicRoomSummary),
    };
  });

  app.post('/api/rooms', async (request, reply) => {
    try {
      const user = await authenticateRequest(app, request);
      const body = createRoomSchema.parse(request.body);
      const room = await app.serverDependencies.roomStore.createRoom({
        host: user,
        config: body,
      });

      return reply.code(201).send({ room: toPublicRoomState(room) });
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Unauthorized.' });
    }
  });

  app.get('/api/rooms/:roomId', async (request, reply) => {
    try {
      await authenticateRequest(app, request);
      const roomId = (request.params as { roomId: string }).roomId;
      const room = await app.serverDependencies.roomStore.getRoom(roomId);

      if (!room) {
        return reply.code(404).send({ error: 'Room not found.' });
      }

      return { room: toPublicRoomState(room) };
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Unauthorized.' });
    }
  });

  app.post('/api/rooms/:roomId/join', async (request, reply) => {
    try {
      const user = await authenticateRequest(app, request);
      const roomId = (request.params as { roomId: string }).roomId;
      const room = await app.serverDependencies.roomStore.getRoom(roomId);

      if (!room) {
        return reply.code(404).send({ error: 'Room not found.' });
      }

      const joined = joinRoom(room, user);

      if (!joined.ok) {
        return reply.code(400).send({ error: joined.message });
      }

      await app.serverDependencies.roomStore.updateRoom(joined.room);
      await app.broadcastRoomState(roomId);
      return { room: toPublicRoomState(joined.room) };
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Unauthorized.' });
    }
  });

  app.post('/api/rooms/:roomId/start', async (request, reply) => {
    try {
      const user = await authenticateRequest(app, request);
      const roomId = (request.params as { roomId: string }).roomId;
      const room = await app.serverDependencies.roomStore.getRoom(roomId);

      if (!room) {
        return reply.code(404).send({ error: 'Room not found.' });
      }

      const started = startRoomGame(room, user, app.serverDependencies.makeSeed());

      if (!started.ok) {
        return reply.code(400).send({ error: started.message });
      }

      await app.serverDependencies.roomStore.updateRoom(started.room);
      await app.broadcastRoomState(roomId);
      return { room: toPublicRoomState(started.room) };
    } catch (error) {
      return reply
        .code(401)
        .send({ error: error instanceof Error ? error.message : 'Unauthorized.' });
    }
  });
};
