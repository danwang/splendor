import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';

import { createAuth0TokenVerifier } from './auth/verify-auth0-token.js';
import { broadcastRoomState, registerGameSocket, type SocketLike } from './realtime/game-socket.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { createInMemoryRoomStore } from './services/room-store.js';
import { type ServerDependencies } from './types.js';

declare module 'fastify' {
  interface FastifyInstance {
    broadcastRoomState: (roomId: string) => Promise<void>;
    serverDependencies: ServerDependencies;
  }
}

export interface CreateAppOptions {
  readonly dependencies?: Partial<ServerDependencies>;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webDistCandidates = [
  resolve(currentDirectory, '../../web/dist'),
  resolve(currentDirectory, '../../../web/dist'),
];
const webDistDirectory = webDistCandidates.find((candidate) => existsSync(candidate)) ?? null;

export const createApp = async (
  options: CreateAppOptions = {},
): Promise<FastifyInstance> => {
  const app = Fastify();

  app.serverDependencies = {
    verifyAccessToken:
      options.dependencies?.verifyAccessToken ??
      createAuth0TokenVerifier('example.invalid', 'example-audience'),
    roomStore: options.dependencies?.roomStore ?? createInMemoryRoomStore(),
    makeSeed: options.dependencies?.makeSeed ?? randomUUID,
  };

  const connections = new Map<string, Map<SocketLike, string>>();

  app.broadcastRoomState = async (roomId: string): Promise<void> => {
    const room = await app.serverDependencies.roomStore.getRoom(roomId);

    if (!room) {
      return;
    }

    broadcastRoomState(connections, roomId, room);
  };

  app.addHook('onClose', async () => {
    await app.serverDependencies.roomStore.close?.();
  });

  await app.register(websocket);
  registerHealthRoutes(app);
  registerRoomRoutes(app);
  registerGameSocket(
    app,
    connections,
    async (token) => app.serverDependencies.verifyAccessToken(token ?? ''),
  );

  if (webDistDirectory) {
    await app.register(fastifyStatic, {
      root: webDistDirectory,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      const requestPath = request.raw.url ?? '/';
      const isApiOrSocket = requestPath.startsWith('/api') || requestPath.startsWith('/ws');

      if (isApiOrSocket) {
        return reply.code(404).send({ error: 'Not found.' });
      }

      return reply.sendFile('index.html');
    });
  }

  return app;
};
