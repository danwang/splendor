import { reduceGame, setupGameWithSeed } from '@splendor/game-engine';

import {
  type AuthenticatedUser,
  type PublicRoomState,
  type RoomParticipant,
  type RoomRecord,
} from '../types.js';

const toPlayerIdentity = (participant: RoomParticipant) => ({
  id: participant.userId,
  displayName: participant.displayName,
});

export const toPublicRoomState = (room: RoomRecord): PublicRoomState => ({
  id: room.id,
  config: room.config,
  hostUserId: room.hostUserId,
  participants: room.participants,
  stateVersion: room.stateVersion,
  game: room.game,
  status: room.game ? room.game.status : 'waiting',
});

export const joinRoom = (
  room: RoomRecord,
  user: AuthenticatedUser,
): { readonly ok: true; readonly room: RoomRecord } | { readonly ok: false; readonly message: string } => {
  const alreadyJoined = room.participants.find((participant) => participant.userId === user.id);

  if (alreadyJoined) {
    return { ok: true, room };
  }

  if (room.participants.length >= room.config.seatCount) {
    return { ok: false, message: 'This room is already full.' };
  }

  if (room.game) {
    return { ok: false, message: 'Cannot join a room after the game has started.' };
  }

  return {
    ok: true,
    room: {
      ...room,
      participants: [
        ...room.participants,
        {
          userId: user.id,
          displayName: user.displayName,
        },
      ],
      stateVersion: room.stateVersion + 1,
      updatedAt: Date.now(),
    },
  };
};

export const startRoomGame = (
  room: RoomRecord,
  user: AuthenticatedUser,
  seed: string,
): { readonly ok: true; readonly room: RoomRecord } | { readonly ok: false; readonly message: string } => {
  if (room.hostUserId !== user.id) {
    return { ok: false, message: 'Only the host can start the game.' };
  }

  if (room.game) {
    return { ok: false, message: 'This room has already started.' };
  }

  if (room.participants.length < 2) {
    return { ok: false, message: 'At least two players are required to start.' };
  }

  return {
    ok: true,
    room: {
      ...room,
      game: setupGameWithSeed(
        room.participants.map(toPlayerIdentity),
        room.config,
        seed,
      ),
      stateVersion: room.stateVersion + 1,
      updatedAt: Date.now(),
    },
  };
};

export const applyRoomMove = (
  room: RoomRecord,
  user: AuthenticatedUser,
  move: Parameters<typeof reduceGame>[1],
): { readonly ok: true; readonly room: RoomRecord } | { readonly ok: false; readonly message: string } => {
  if (!room.game) {
    return { ok: false, message: 'This room has not started a game yet.' };
  }

  const activePlayer = room.game.players[room.game.turn.activePlayerIndex];

  if (!activePlayer) {
    return { ok: false, message: 'The room game has no active player.' };
  }

  if (activePlayer.identity.id !== user.id) {
    return { ok: false, message: 'It is not your turn.' };
  }

  const result = reduceGame(room.game, move);

  if (!result.ok) {
    return { ok: false, message: result.error.message };
  }

  return {
    ok: true,
    room: {
      ...room,
      game: result.state,
      stateVersion: room.stateVersion + 1,
      updatedAt: Date.now(),
    },
  };
};
