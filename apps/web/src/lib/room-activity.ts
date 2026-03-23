import { type CardTier, type GameState, type GemColor } from '@splendor/game-engine';

import { cardTierOrder, gemOrder } from './game-ui.js';
import { type PublicRoomState } from './types.js';

export interface RoomActivityEntry {
  readonly accent: 'amber' | 'emerald' | 'sky';
  readonly afterStateVersion: number;
  readonly beforeStateVersion: number;
  readonly id: string;
  readonly message: string;
  readonly stateVersion: number;
}

export interface RoomAnimationState {
  readonly changedBankColors: readonly GemColor[];
  readonly changedDeckTiers: readonly CardTier[];
  readonly changedMarketCardIds: readonly string[];
  readonly changedPlayerIds: readonly string[];
}

const emptyAnimationState: RoomAnimationState = {
  changedBankColors: [],
  changedDeckTiers: [],
  changedMarketCardIds: [],
  changedPlayerIds: [],
};

const totalTokens = (tokens: GameState['bank']): number =>
  gemOrder.reduce((sum, color) => sum + tokens[color], 0);

const describeChipDelta = (
  previousTokens: GameState['bank'],
  nextTokens: GameState['bank'],
  direction: 'gain' | 'loss',
): string => {
  const parts = gemOrder.flatMap((color) => {
    const delta = nextTokens[color] - previousTokens[color];
    const normalizedDelta = direction === 'gain' ? delta : -delta;

    if (normalizedDelta <= 0) {
      return [];
    }

    return [`${normalizedDelta} ${color}`];
  });

  return parts.join(' • ');
};

const playerScore = (player: GameState['players'][number]): number =>
  player.purchasedCards.reduce((sum, card) => sum + card.points, 0) +
  player.nobles.reduce((sum, noble) => sum + noble.points, 0);

const hasCardInMarket = (game: GameState, cardId: string): boolean =>
  cardTierOrder.some((tier) => game.market[`tier${tier}`].some((card) => card.id === cardId));

const playerChanged = (
  previousPlayer: GameState['players'][number],
  nextPlayer: GameState['players'][number],
): boolean =>
  playerScore(previousPlayer) !== playerScore(nextPlayer) ||
  gemOrder.some((color) => previousPlayer.tokens[color] !== nextPlayer.tokens[color]) ||
  previousPlayer.purchasedCards.length !== nextPlayer.purchasedCards.length ||
  previousPlayer.reservedCards.length !== nextPlayer.reservedCards.length ||
  previousPlayer.nobles.length !== nextPlayer.nobles.length;

const pushEntry = (
  entries: RoomActivityEntry[],
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
  message: string,
  accent: RoomActivityEntry['accent'],
): void => {
  entries.push({
    accent,
    afterStateVersion: nextRoom.stateVersion,
    beforeStateVersion: previousRoom.stateVersion,
    id: `${nextRoom.stateVersion}-${entries.length}-${message}`,
    message,
    stateVersion: nextRoom.stateVersion,
  });
};

export const deriveRoomAnimationState = (
  previousRoom: PublicRoomState | null,
  nextRoom: PublicRoomState | null,
): RoomAnimationState => {
  if (!previousRoom?.game || !nextRoom?.game) {
    return emptyAnimationState;
  }

  return {
    changedBankColors: gemOrder.filter(
      (color) => previousRoom.game!.bank[color] !== nextRoom.game!.bank[color],
    ),
    changedDeckTiers: cardTierOrder.filter(
      (tier) =>
        previousRoom.game!.decks[`tier${tier}`].length !== nextRoom.game!.decks[`tier${tier}`].length,
    ),
    changedMarketCardIds: cardTierOrder.flatMap((tier) =>
      nextRoom.game!.market[`tier${tier}`]
        .filter(
          (card, index) => previousRoom.game!.market[`tier${tier}`][index]?.id !== card.id,
        )
        .map((card) => card.id),
    ),
    changedPlayerIds: nextRoom.game.players
      .filter((player, index) => {
        const previousPlayer = previousRoom.game!.players[index];

        return previousPlayer ? playerChanged(previousPlayer, player) : false;
      })
      .map((player) => player.identity.id),
  };
};

export const deriveRoomActivityEntries = (
  previousRoom: PublicRoomState | null,
  nextRoom: PublicRoomState | null,
): readonly RoomActivityEntry[] => {
  if (!previousRoom || !nextRoom) {
    return [];
  }

  const entries: RoomActivityEntry[] = [];
  const previousParticipants = new Map(
    previousRoom.participants.map((participant) => [participant.userId, participant]),
  );
  const nextParticipants = new Map(
    nextRoom.participants.map((participant) => [participant.userId, participant]),
  );

  nextRoom.participants
    .filter((participant) => !previousParticipants.has(participant.userId))
    .forEach((participant) => {
      pushEntry(entries, previousRoom, nextRoom, `${participant.displayName} joined the room.`, 'emerald');
    });

  previousRoom.participants
    .filter((participant) => !nextParticipants.has(participant.userId))
    .forEach((participant) => {
      pushEntry(entries, previousRoom, nextRoom, `${participant.displayName} left the room.`, 'sky');
    });

  if (previousRoom.status === 'waiting' && nextRoom.game) {
    pushEntry(entries, previousRoom, nextRoom, 'The host started the match.', 'amber');
  }

  if (!previousRoom.game || !nextRoom.game) {
    return entries;
  }

  const previousGame = previousRoom.game;
  const nextGame = nextRoom.game;

  nextGame.players.forEach((nextPlayer, index) => {
    const previousPlayer = previousGame.players[index];

    if (!previousPlayer) {
      return;
    }

    if (!previousPlayer.resigned && nextPlayer.resigned) {
      pushEntry(entries, previousRoom, nextRoom, `${nextPlayer.identity.displayName} resigned.`, 'sky');
    }

    const purchasedCards = nextPlayer.purchasedCards.filter(
      (card) => !previousPlayer.purchasedCards.some((entry) => entry.id === card.id),
    );
    const reservedCards = nextPlayer.reservedCards.filter(
      (card) => !previousPlayer.reservedCards.some((entry) => entry.id === card.id),
    );
    const claimedNobles = nextPlayer.nobles.filter(
      (noble) => !previousPlayer.nobles.some((entry) => entry.id === noble.id),
    );

    reservedCards.forEach((card) => {
      const message = hasCardInMarket(previousGame, card.id)
        ? `${nextPlayer.identity.displayName} reserved a market card.`
        : `${nextPlayer.identity.displayName} blind reserved tier ${card.tier}.`;

      pushEntry(entries, previousRoom, nextRoom, message, 'sky');
    });

    purchasedCards.forEach((card) => {
      const message = previousPlayer.reservedCards.some((entry) => entry.id === card.id)
        ? `${nextPlayer.identity.displayName} bought a reserved card.`
        : hasCardInMarket(previousGame, card.id)
          ? `${nextPlayer.identity.displayName} bought a market card.`
          : `${nextPlayer.identity.displayName} bought a card.`;

      pushEntry(entries, previousRoom, nextRoom, message, 'amber');
    });

    claimedNobles.forEach(() => {
      pushEntry(entries, previousRoom, nextRoom, `${nextPlayer.identity.displayName} claimed a noble.`, 'emerald');
    });
  });

  const previousActor = previousGame.players[previousGame.turn.activePlayerIndex];
  const nextActor = nextGame.players.find(
    (player) => player.identity.id === previousActor?.identity.id,
  );

  if (previousActor && nextActor) {
    const tokenDelta = totalTokens(nextActor.tokens) - totalTokens(previousActor.tokens);
    const boughtCard =
      nextActor.purchasedCards.length > previousActor.purchasedCards.length ||
      nextActor.reservedCards.length > previousActor.reservedCards.length;

    if (previousGame.turn.kind === 'main-action' && tokenDelta > 0 && !boughtCard) {
      const chipsTaken = describeChipDelta(previousActor.tokens, nextActor.tokens, 'gain');

      pushEntry(
        entries,
        previousRoom,
        nextRoom,
        `${previousActor.identity.displayName} took ${chipsTaken}.`,
        'sky',
      );
    }

    if (previousGame.turn.kind === 'discard' && tokenDelta < 0) {
      pushEntry(
        entries,
        previousRoom,
        nextRoom,
        `${previousActor.identity.displayName} discarded ${Math.abs(tokenDelta)} chip${tokenDelta === -1 ? '' : 's'}.`,
        'amber',
      );
    }

    if (
      previousGame.turn.kind === 'noble' &&
      nextActor.nobles.length === previousActor.nobles.length &&
      nextGame.turn.activePlayerIndex !== previousGame.turn.activePlayerIndex &&
      !nextActor.resigned
    ) {
      pushEntry(entries, previousRoom, nextRoom, `${previousActor.identity.displayName} skipped a noble.`, 'sky');
    }
  }

  if (previousGame.status !== 'finished' && nextGame.status === 'finished') {
    const winners = nextGame.result?.winners ?? [];

    if (winners.length > 0) {
      pushEntry(entries, previousRoom, nextRoom, `${winners.join(', ')} won the game.`, 'emerald');
    }
  }

  return entries;
};

export const latestRoomEntries = (
  previous: readonly RoomActivityEntry[],
  nextEntries: readonly RoomActivityEntry[],
  limit = 18,
): readonly RoomActivityEntry[] => [...[...nextEntries].reverse(), ...previous].slice(0, limit);

export const deriveRoomHistoryEntries = (
  history: readonly PublicRoomState[],
  limit = 18,
): readonly RoomActivityEntry[] => {
  const sortedHistory = [...history].sort((left, right) => left.stateVersion - right.stateVersion);
  const entries = sortedHistory.slice(1).flatMap((nextRoom, index) => {
    const previousRoom = sortedHistory[index] ?? null;

    return deriveRoomActivityEntries(previousRoom, nextRoom);
  });

  return [...entries].reverse().slice(0, limit);
};
