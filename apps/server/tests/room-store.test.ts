import { setupGameWithSeed } from '@splendor/game-engine';
import { describe, expect, it } from 'vitest';

import { createInMemoryRoomStore } from '../src/services/room-store.js';
import { type RoomRecord } from '../src/types.js';

const host = {
  id: 'host-user',
  displayName: 'Host User',
};

describe('in-memory room store cleanup', () => {
  it('evicts waiting, in-progress, and finished rooms after their TTLs', async () => {
    let currentTime = 1_000;
    const store = createInMemoryRoomStore({
      cleanupIntervalMs: 60_000,
      finishedRoomTtlMs: 100,
      inProgressRoomTtlMs: 200,
      now: () => currentTime,
      waitingRoomTtlMs: 50,
    });

    const waitingRoom = await store.createRoom({
      host,
      config: { seatCount: 2, targetScore: 15 },
    });

    currentTime += 60;
    await expect(store.getRoom(waitingRoom.id)).resolves.toBeNull();

    const inProgressBase = await store.createRoom({
      host,
      config: { seatCount: 2, targetScore: 15 },
    });
    const inProgressGame = setupGameWithSeed(
      [
        { id: host.id, displayName: host.displayName },
        { id: 'guest-user', displayName: 'Guest User' },
      ],
      inProgressBase.config,
      'room-store-in-progress',
    );
    const inProgressRoom: RoomRecord = {
      ...inProgressBase,
      game: inProgressGame,
    };

    await store.updateRoom(inProgressRoom);
    currentTime += 150;
    await expect(store.getRoom(inProgressRoom.id)).resolves.not.toBeNull();
    currentTime += 60;
    await expect(store.getRoom(inProgressRoom.id)).resolves.toBeNull();

    const finishedBase = await store.createRoom({
      host,
      config: { seatCount: 2, targetScore: 15 },
    });
    const finishedGame = setupGameWithSeed(
      [
        { id: host.id, displayName: host.displayName },
        { id: 'guest-user', displayName: 'Guest User' },
      ],
      finishedBase.config,
      'room-store-finished',
    );
    const finishedRoom: RoomRecord = {
      ...finishedBase,
      game: {
        ...finishedGame,
        status: 'finished',
        result: {
          winners: [],
          winningScore: 0,
          tiedOnCards: false,
        },
      },
    };

    await store.updateRoom(finishedRoom);
    currentTime += 110;
    await expect(store.getRoom(finishedRoom.id)).resolves.toBeNull();

    await store.close?.();
  });
});
