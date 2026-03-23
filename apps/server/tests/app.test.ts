import { afterEach, describe, expect, it } from 'vitest';

import { createGuestTokenVerifier } from '../src/auth/verify-guest-token.js';
import { createApp } from '../src/app.js';
import { submitRoomMoveFromSocket } from '../src/realtime/game-socket.js';
import { type AuthenticatedUser, type ServerMessage } from '../src/types.js';

const users: Record<string, AuthenticatedUser> = {
  host: { id: 'user-host', displayName: 'Host' },
  guest: { id: 'user-guest', displayName: 'Guest' },
};

const verifyAccessToken = async (token: string): Promise<AuthenticatedUser> => {
  const user = users[token];

  if (!user) {
    throw new Error('Unauthorized.');
  }

  return user;
};

const authHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const createFakeSocket = () => {
  const messages: ServerMessage[] = [];

  return {
    socket: {
      send: (payload: string): void => {
        messages.push(JSON.parse(payload) as ServerMessage);
      },
      close: (): void => undefined,
      on: (): void => undefined,
    },
    messages,
  };
};

describe('server app', () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps.length = 0;
  });

  it('rejects unauthorized room creation', async () => {
    const app = await createApp({ dependencies: { verifyAccessToken } });

    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { seatCount: 2, targetScore: 15 },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects an invalid targetScore with 400, not 401', async () => {
    const app = await createApp({ dependencies: { verifyAccessToken } });

    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 18 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('creates a room with the requested target score for an authorized user', async () => {
    const app = await createApp({ dependencies: { verifyAccessToken } });

    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 21 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().room.config.targetScore).toBe(21);
    expect(response.json().room.participants).toHaveLength(1);
    expect(response.json().roomHistory.map((entry: { readonly stateVersion: number }) => entry.stateVersion)).toEqual([0]);
  });

  it('lists discoverable rooms without requiring authentication', async () => {
    const app = await createApp({ dependencies: { verifyAccessToken } });

    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 3, targetScore: 15 },
    });

    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: '/api/rooms',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().rooms).toHaveLength(1);
    expect(response.json().rooms[0].participants).toHaveLength(1);
    expect(response.json().rooms[0].config.seatCount).toBe(3);
  });

  it('rejects an invalid move without changing room state', async () => {
    const app = await createApp({
      dependencies: {
        verifyAccessToken,
        makeSeed: () => 'server-test-seed',
      },
    });

    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 15 },
    });
    const roomId = created.json().room.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: authHeader('guest'),
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/start`,
      headers: authHeader('host'),
    });
    expect(started.statusCode).toBe(200);
    const initialVersion = started.json().room.stateVersion as number;

    const roomConnections = new Map<
      string,
      Map<ReturnType<typeof createFakeSocket>['socket'], string>
    >();
    const hostSocket = createFakeSocket();
    roomConnections.set(roomId, new Map([[hostSocket.socket, users.host!.id]]));

    await submitRoomMoveFromSocket(
      app,
      roomConnections,
      roomId,
      users.host!,
      { type: 'take-distinct', colors: ['white', 'white'] },
      hostSocket.socket,
    );

    const errorMessage = hostSocket.messages.at(-1);

    expect(errorMessage).toBeDefined();
    if (!errorMessage) {
      throw new Error('Expected socket error message.');
    }
    expect(errorMessage.type).toBe('error');

    const roomResponse = await app.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}`,
      headers: authHeader('host'),
    });

    expect(roomResponse.json().room.stateVersion).toBe(initialVersion);
  });

  it('broadcasts updated room state to all connected clients after a valid move', async () => {
    const app = await createApp({
      dependencies: {
        verifyAccessToken,
        makeSeed: () => 'server-broadcast-seed',
      },
    });

    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 15 },
    });
    const roomId = created.json().room.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: authHeader('guest'),
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/start`,
      headers: authHeader('host'),
    });
    const hostSocket = createFakeSocket();
    const guestSocket = createFakeSocket();
    const activePlayerId = started.json().room.game.players[
      started.json().room.game.turn.activePlayerIndex
    ].identity.id as string;
    const activeUser = activePlayerId === users.host!.id ? users.host! : users.guest!;
    const activeSocket = activePlayerId === users.host!.id ? hostSocket.socket : guestSocket.socket;

    const roomConnections = new Map<
      string,
      Map<ReturnType<typeof createFakeSocket>['socket'], string>
    >();
    roomConnections.set(
      roomId,
      new Map([
        [hostSocket.socket, users.host!.id],
        [guestSocket.socket, users.guest!.id],
      ]),
    );

    await submitRoomMoveFromSocket(
      app,
      roomConnections,
      roomId,
      activeUser,
      {
        type: 'take-distinct',
        colors: ['white', 'blue', 'green'],
      },
      activeSocket,
    );

    const hostMessage = hostSocket.messages.at(-1);
    const guestMessage = guestSocket.messages.at(-1);

    expect(hostMessage).toBeDefined();
    expect(guestMessage).toBeDefined();
    if (!hostMessage || !guestMessage) {
      throw new Error('Expected broadcast messages for both sockets.');
    }
    expect(hostMessage.type).toBe('room-state');
    expect(guestMessage.type).toBe('room-state');

    if (hostMessage.type === 'room-state' && guestMessage.type === 'room-state') {
      expect(hostMessage.room.stateVersion).toBe(3);
      expect(guestMessage.room.stateVersion).toBe(3);
      expect(hostMessage.roomHistory.map((entry) => entry.stateVersion)).toEqual([0, 1, 2, 3]);
      expect(guestMessage.roomHistory.map((entry) => entry.stateVersion)).toEqual([0, 1, 2, 3]);
      expect(hostMessage.room.game?.turn.kind).toBe('main-action');
      expect(hostMessage.room.game?.turn.activePlayerIndex).toBe(1);
    }
  });

  it('returns connected users in room fetches', async () => {
    const app = await createApp({ dependencies: { verifyAccessToken } });

    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 15 },
    });
    const roomId = created.json().room.id as string;

    app.getConnectedUserIds = (requestedRoomId: string) =>
      requestedRoomId === roomId ? [users.host!.id, users.guest!.id] : [];

    const response = await app.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}`,
      headers: authHeader('host'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().room.connectedUserIds).toEqual([users.host!.id, users.guest!.id]);
  });

  it('returns full room history when reloading after state changes', async () => {
    const app = await createApp({
      dependencies: {
        verifyAccessToken,
        makeSeed: () => 'server-history-seed',
      },
    });

    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('host'),
      payload: { seatCount: 2, targetScore: 15 },
    });
    const roomId = created.json().room.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: authHeader('guest'),
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/start`,
      headers: authHeader('host'),
    });
    const activePlayerId = started.json().room.game.players[
      started.json().room.game.turn.activePlayerIndex
    ].identity.id as string;
    const activeToken = activePlayerId === users.host!.id ? 'host' : 'guest';

    await submitRoomMoveFromSocket(
      app,
      new Map(),
      roomId,
      users[activeToken]!,
      {
        type: 'take-distinct',
        colors: ['white', 'blue', 'green'],
      },
      createFakeSocket().socket,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}`,
      headers: authHeader('host'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().room.stateVersion).toBe(3);
    expect(response.json().roomHistory.map((entry: { readonly stateVersion: number }) => entry.stateVersion)).toEqual([
      0,
      1,
      2,
      3,
    ]);
  });

  it('accepts guest bearer tokens when using the guest verifier', async () => {
    const app = await createApp({
      dependencies: {
        verifyAccessToken: createGuestTokenVerifier(),
      },
    });

    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: authHeader('guest:guest-1:Alice%20Guest'),
      payload: { seatCount: 2, targetScore: 15 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().room.participants[0]).toEqual({
      userId: 'guest-1',
      displayName: 'Alice Guest',
    });
  });
});
