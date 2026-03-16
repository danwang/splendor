import { randomUUID } from 'node:crypto';

import { type CreateRoomInput, type RoomRecord, type RoomStore } from '../types.js';

export interface InMemoryRoomStoreOptions {
  readonly cleanupIntervalMs?: number;
  readonly finishedRoomTtlMs?: number;
  readonly inProgressRoomTtlMs?: number;
  readonly now?: () => number;
  readonly waitingRoomTtlMs?: number;
}

const defaultCleanupIntervalMs = 10 * 60 * 1000;
const defaultWaitingRoomTtlMs = 12 * 60 * 60 * 1000;
const defaultInProgressRoomTtlMs = 24 * 60 * 60 * 1000;
const defaultFinishedRoomTtlMs = 6 * 60 * 60 * 1000;

const getRoomStatus = (room: RoomRecord): 'waiting' | 'in_progress' | 'finished' =>
  room.game ? room.game.status : 'waiting';

export const createInMemoryRoomStore = (
  options: InMemoryRoomStoreOptions = {},
): RoomStore => {
  const rooms = new Map<string, RoomRecord>();
  const now = options.now ?? Date.now;
  const cleanupIntervalMs = options.cleanupIntervalMs ?? defaultCleanupIntervalMs;
  const waitingRoomTtlMs = options.waitingRoomTtlMs ?? defaultWaitingRoomTtlMs;
  const inProgressRoomTtlMs = options.inProgressRoomTtlMs ?? defaultInProgressRoomTtlMs;
  const finishedRoomTtlMs = options.finishedRoomTtlMs ?? defaultFinishedRoomTtlMs;

  const isExpired = (room: RoomRecord): boolean => {
    const ageMs = now() - room.updatedAt;
    const status = getRoomStatus(room);

    if (status === 'waiting') {
      return ageMs > waitingRoomTtlMs;
    }

    if (status === 'finished') {
      return ageMs > finishedRoomTtlMs;
    }

    return ageMs > inProgressRoomTtlMs;
  };

  const cleanupExpiredRooms = (): void => {
    rooms.forEach((room, roomId) => {
      if (isExpired(room)) {
        rooms.delete(roomId);
      }
    });
  };

  const cleanupHandle = setInterval(cleanupExpiredRooms, cleanupIntervalMs);

  cleanupHandle.unref?.();

  return {
    createRoom: async (input: CreateRoomInput): Promise<RoomRecord> => {
      const timestamp = now();
      const room: RoomRecord = {
        createdAt: timestamp,
        id: randomUUID(),
        config: input.config,
        hostUserId: input.host.id,
        participants: [
          {
            userId: input.host.id,
            displayName: input.host.displayName,
          },
        ],
        stateVersion: 0,
        game: null,
        updatedAt: timestamp,
      };

      rooms.set(room.id, room);
      return room;
    },
    getRoom: async (roomId: string): Promise<RoomRecord | null> => {
      cleanupExpiredRooms();
      return rooms.get(roomId) ?? null;
    },
    updateRoom: async (room: RoomRecord): Promise<void> => {
      rooms.set(room.id, {
        ...room,
        updatedAt: now(),
      });
    },
    close: async (): Promise<void> => {
      clearInterval(cleanupHandle);
      rooms.clear();
    },
  };
};
