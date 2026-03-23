import { getPlayerScore, reduceGame, resolveGameResult, setupGameWithSeed, type GameState } from '@splendor/game-engine';

import {
  type AuthenticatedUser,
  type PublicRoomSummary,
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
  connectedUserIds: [],
  hostUserId: room.hostUserId,
  participants: room.participants,
  stateVersion: room.stateVersion,
  game: room.game,
  status: room.game ? room.game.status : 'waiting',
});

export const withConnectedUserIds = (
  room: PublicRoomState,
  connectedUserIds: readonly string[],
): PublicRoomState => ({
  ...room,
  connectedUserIds,
});

export const toPublicRoomSummary = (room: RoomRecord): PublicRoomSummary => ({
  id: room.id,
  config: room.config,
  hostUserId: room.hostUserId,
  participants: room.participants,
  stateVersion: room.stateVersion,
  status: room.game ? room.game.status : 'waiting',
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
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

export const bootRoomParticipant = (
  room: RoomRecord,
  hostUser: AuthenticatedUser,
  targetUserId: string,
): { readonly ok: true; readonly room: RoomRecord } | { readonly ok: false; readonly message: string } => {
  if (room.hostUserId !== hostUser.id) {
    return { ok: false, message: 'Only the host can remove players.' };
  }

  if (room.game) {
    return { ok: false, message: 'Players can only be removed before the game starts.' };
  }

  if (targetUserId === room.hostUserId) {
    return { ok: false, message: 'The host cannot remove themselves.' };
  }

  const participantExists = room.participants.some((participant) => participant.userId === targetUserId);

  if (!participantExists) {
    return { ok: false, message: 'Player not found in this room.' };
  }

  return {
    ok: true,
    room: {
      ...room,
      participants: room.participants.filter((participant) => participant.userId !== targetUserId),
      stateVersion: room.stateVersion + 1,
      updatedAt: Date.now(),
    },
  };
};

const findNextActivePlayerIndex = (
  players: GameState['players'],
  currentIndex: number,
): number => {
  const count = players.length;

  for (let i = 1; i <= count; i++) {
    const nextIndex = (currentIndex + i) % count;

    if (!players[nextIndex]?.resigned) {
      return nextIndex;
    }
  }

  return currentIndex;
};

export const resignPlayer = (
  room: RoomRecord,
  user: AuthenticatedUser,
): { readonly ok: true; readonly room: RoomRecord } | { readonly ok: false; readonly message: string } => {
  if (!room.game) {
    return { ok: false, message: 'This room has not started a game yet.' };
  }

  if (room.game.status === 'finished') {
    return { ok: false, message: 'The game is already finished.' };
  }

  const playerIndex = room.game.players.findIndex((player) => player.identity.id === user.id);

  if (playerIndex === -1) {
    return { ok: false, message: 'You are not a player in this game.' };
  }

  const player = room.game.players[playerIndex]!;

  if (player.resigned) {
    return { ok: false, message: 'You have already resigned.' };
  }

  const updatedPlayers = room.game.players.map((p, i) =>
    i === playerIndex ? { ...p, resigned: true as const } : p,
  );

  const activePlayers = updatedPlayers.filter((p) => !p.resigned);

  let updatedGame: GameState;

  if (room.game.turn.activePlayerIndex === playerIndex) {
    if (activePlayers.length <= 1) {
      // Active player is the last one — end immediately.
      // Always use main-action so the finished snapshot has no blocking turn kind.
      const result = resolveGameResult(updatedPlayers);

      updatedGame = {
        ...room.game,
        players: updatedPlayers,
        status: 'finished',
        turn: { kind: 'main-action', activePlayerIndex: playerIndex, round: room.game.turn.round },
        ...(result ? { result } : {}),
      };
    } else {
      // Active player resigned, others remain — advance turn with round/game-end check.
      const nextIndex = findNextActivePlayerIndex(updatedPlayers, playerIndex);
      const wrapped = nextIndex <= playerIndex;
      const someoneReachedTarget =
        wrapped &&
        updatedPlayers.some(
          (p) => !p.resigned && getPlayerScore(p) >= room.game!.config.targetScore,
        );

      if (someoneReachedTarget) {
        const result = resolveGameResult(updatedPlayers);

        updatedGame = {
          ...room.game,
          players: updatedPlayers,
          status: 'finished',
          turn: { kind: 'main-action', activePlayerIndex: playerIndex, round: room.game.turn.round },
          ...(result ? { result } : {}),
        };
      } else {
        updatedGame = {
          ...room.game,
          players: updatedPlayers,
          turn: {
            kind: 'main-action',
            activePlayerIndex: nextIndex,
            round: wrapped ? room.game.turn.round + 1 : room.game.turn.round,
          },
        };
      }
    }
  } else {
    // Non-active player resigned.
    if (activePlayers.length <= 1 && room.game.turn.kind === 'main-action') {
      // Active player is in main-action and now the last one standing.
      // End immediately — deferring would grant them a free strategic move.
      const result = resolveGameResult(updatedPlayers);

      updatedGame = {
        ...room.game,
        players: updatedPlayers,
        status: 'finished',
        turn: { kind: 'main-action', activePlayerIndex: room.game.turn.activePlayerIndex, round: room.game.turn.round },
        ...(result ? { result } : {}),
      };
    } else {
      // Either multiple players remain, or the active player is mid-noble/mid-discard
      // (mandatory resolution they already earned). Let them finish;
      // advanceTurn will detect last-player-standing when the turn advances.
      updatedGame = {
        ...room.game,
        players: updatedPlayers,
      };
    }
  }

  return {
    ok: true,
    room: {
      ...room,
      game: updatedGame,
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
