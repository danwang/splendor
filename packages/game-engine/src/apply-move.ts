import {
  addTokenCounts,
  applyPayment,
  availableNobles,
  ensureTierKey,
  findAffordablePayment,
  findVisibleCard,
  isValidPaymentSelection,
  replaceMarketCard,
  resolveGameResult,
  takeTopDeckCard,
  totalTokens,
} from './helpers.js';
import {
  type GameState,
  type GemColor,
  type Move,
  type PaymentSelection,
  type PlayerState,
  type ReduceGameResult,
} from './types.js';

const fail = (message: string): ReduceGameResult => ({
  ok: false,
  error: { message },
});

const replacePlayer = (
  players: readonly PlayerState[],
  index: number,
  player: PlayerState,
): readonly PlayerState[] =>
  players.map((entry, entryIndex) => (entryIndex === index ? player : entry));

const findNextActivePlayerIndex = (
  players: readonly PlayerState[],
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

const advanceTurn = (
  state: GameState,
  updatedPlayers: readonly PlayerState[],
  updatedNobles: GameState['nobles'],
): ReduceGameResult => {
  const currentTurn = state.turn;
  const nextActivePlayerIndex = findNextActivePlayerIndex(updatedPlayers, currentTurn.activePlayerIndex);
  const wrapped = nextActivePlayerIndex <= currentTurn.activePlayerIndex;
  const isLastPlayerStanding = updatedPlayers.filter((p) => !p.resigned).length <= 1;
  const someoneReachedTarget = updatedPlayers.some(
    (player) =>
      !player.resigned &&
      player.purchasedCards.reduce((sum, card) => sum + card.points, 0) +
        player.nobles.reduce((sum, noble) => sum + noble.points, 0) >=
      state.config.targetScore,
  );
  const shouldEnd = isLastPlayerStanding || (wrapped && someoneReachedTarget);
  const nextTurn = {
    kind: 'main-action' as const,
    activePlayerIndex: shouldEnd ? currentTurn.activePlayerIndex : nextActivePlayerIndex,
    round: shouldEnd ? currentTurn.round : wrapped ? currentTurn.round + 1 : currentTurn.round,
  };

  if (shouldEnd) {
    const result = resolveGameResult(updatedPlayers);

    if (!result) {
      return fail('Game ended without a resolvable result.');
    }

    return {
      ok: true,
      state: {
        ...state,
        players: updatedPlayers,
        nobles: updatedNobles,
        status: 'finished',
        turn: nextTurn,
        result,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      players: updatedPlayers,
      nobles: updatedNobles,
      status: 'in_progress',
      turn: nextTurn,
    },
  };
};

const resolveAfterMainAction = (
  state: GameState,
  updatedPlayers: readonly PlayerState[],
  updatedNobles: GameState['nobles'],
): ReduceGameResult => {
  const player = updatedPlayers[state.turn.activePlayerIndex];

  if (!player) {
    return fail('The active player could not be resolved after move application.');
  }

  const overflow = totalTokens(player.tokens) - 10;

  if (overflow > 0) {
    return {
      ok: true,
      state: {
        ...state,
        players: updatedPlayers,
        nobles: updatedNobles,
        turn: {
          kind: 'discard',
          activePlayerIndex: state.turn.activePlayerIndex,
          round: state.turn.round,
          requiredCount: overflow,
        },
      },
    };
  }

  const eligibleNobles = availableNobles(player, updatedNobles);

  if (eligibleNobles.length > 0) {
    return {
      ok: true,
      state: {
        ...state,
        players: updatedPlayers,
        nobles: updatedNobles,
        turn: {
          kind: 'noble',
          activePlayerIndex: state.turn.activePlayerIndex,
          round: state.turn.round,
          eligibleNobleIds: eligibleNobles.map((noble) => noble.id),
        },
      },
    };
  }

  return advanceTurn(state, updatedPlayers, updatedNobles);
};

const applyDiscardTokens = (
  player: PlayerState,
  tokens: readonly GemColor[],
): PlayerState | null => {
  const updatedTokens = tokens.reduce(
    (current, color) => addTokenCounts(current, { [color]: -1 }),
    player.tokens,
  );

  if (Object.values(updatedTokens).some((count) => count < 0)) {
    return null;
  }

  return {
    ...player,
    tokens: updatedTokens,
  };
};

const failInvalidPayment = (
  cardId: string,
  submittedPayment: PaymentSelection,
  suggestedPayment: PaymentSelection | null,
): ReduceGameResult =>
  fail(
    `The submitted payment does not legally purchase card ${cardId}. Submitted: ${JSON.stringify(submittedPayment)} Suggested: ${JSON.stringify(suggestedPayment)}`,
  );

export const reduceGame = (state: GameState, move: Move): ReduceGameResult => {
  if (state.status === 'finished') {
    return fail('The game is already finished.');
  }

  const activePlayerIndex = state.turn.activePlayerIndex;
  const player = state.players[activePlayerIndex];

  if (!player) {
    return fail('The active player could not be resolved.');
  }

  if (state.turn.kind === 'discard') {
    if (move.type !== 'discard-tokens') {
      return fail('The current turn is waiting for a discard move.');
    }

    if (move.tokens.length !== state.turn.requiredCount) {
      return fail(
        `This turn requires discarding exactly ${state.turn.requiredCount} tokens.`,
      );
    }

    const discardedPlayer = applyDiscardTokens(player, move.tokens);

    if (!discardedPlayer) {
      return fail('Discard selection removes tokens the player does not have.');
    }

    if (totalTokens(discardedPlayer.tokens) !== 10) {
      return fail('Discard selection must leave the player with exactly ten tokens.');
    }

    return advanceTurn(
      {
        ...state,
        bank: move.tokens.reduce(
          (bank, color) => addTokenCounts(bank, { [color]: 1 }),
          state.bank,
        ),
        turn: {
          kind: 'main-action',
          activePlayerIndex,
          round: state.turn.round,
        },
      },
      replacePlayer(state.players, activePlayerIndex, discardedPlayer),
      state.nobles,
    );
  }

  if (state.turn.kind === 'noble') {
    switch (move.type) {
      case 'claim-noble': {
        if (!state.turn.eligibleNobleIds.includes(move.nobleId)) {
          return fail('The requested noble is not eligible for the current choice.');
        }

        const noble = state.nobles.find((entry) => entry.id === move.nobleId);

        if (!noble) {
          return fail('The requested noble is not available to claim.');
        }

        return advanceTurn(
          {
            ...state,
            turn: {
              kind: 'main-action',
              activePlayerIndex,
              round: state.turn.round,
            },
          },
          replacePlayer(state.players, activePlayerIndex, {
            ...player,
            nobles: [...player.nobles, noble],
          }),
          state.nobles.filter((entry) => entry.id !== noble.id),
        );
      }

      case 'skip-noble':
        return advanceTurn(
          {
            ...state,
            turn: {
              kind: 'main-action',
              activePlayerIndex,
              round: state.turn.round,
            },
          },
          state.players,
          state.nobles,
        );

      default:
        return fail('The current turn is waiting on a noble decision.');
    }
  }

  switch (move.type) {
    case 'take-distinct': {
      const distinctColors = [...new Set(move.colors)];

      if (
        move.colors.length < 1 ||
        move.colors.length > 3 ||
        distinctColors.length !== move.colors.length
      ) {
        return fail('Distinct token moves must use one to three different colors.');
      }

      if (move.colors.some((color) => state.bank[color] < 1)) {
        return fail('A requested token color is not available in the bank.');
      }

      return resolveAfterMainAction(
        {
          ...state,
          bank: move.colors.reduce(
            (bank, color) => addTokenCounts(bank, { [color]: -1 }),
            state.bank,
          ),
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          tokens: move.colors.reduce(
            (tokens, color) => addTokenCounts(tokens, { [color]: 1 }),
            player.tokens,
          ),
        }),
        state.nobles,
      );
    }

    case 'take-pair': {
      if (state.bank[move.color] < 4) {
        return fail('A color must have at least four tokens to take a pair.');
      }

      return resolveAfterMainAction(
        {
          ...state,
          bank: addTokenCounts(state.bank, { [move.color]: -2 }),
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          tokens: addTokenCounts(player.tokens, { [move.color]: 2 }),
        }),
        state.nobles,
      );
    }

    case 'reserve-visible': {
      if (player.reservedCards.length >= 3) {
        return fail('A player may not reserve more than three cards.');
      }

      const visibleCard = findVisibleCard(state.market, move.cardId);

      if (!visibleCard) {
        return fail(`The requested visible card ${move.cardId} is not in the market.`);
      }

      const tierKey = ensureTierKey(visibleCard.tier);
      const marketReplacement = replaceMarketCard(
        state.market[tierKey],
        move.cardId,
        state.decks[tierKey],
      );

      return resolveAfterMainAction(
        {
          ...state,
          bank: state.bank.gold > 0 ? addTokenCounts(state.bank, { gold: -1 }) : state.bank,
          market: {
            ...state.market,
            [tierKey]: marketReplacement.market,
          },
          decks: {
            ...state.decks,
            [tierKey]: marketReplacement.deckIds,
          },
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          reservedCards: [...player.reservedCards, visibleCard.card],
          tokens: state.bank.gold > 0 ? addTokenCounts(player.tokens, { gold: 1 }) : player.tokens,
        }),
        state.nobles,
      );
    }

    case 'reserve-deck': {
      if (player.reservedCards.length >= 3) {
        return fail('A player may not reserve more than three cards.');
      }

      const tierKey = ensureTierKey(move.tier);
      const reservedCard = takeTopDeckCard(state.decks[tierKey]);

      if (!reservedCard.card) {
        return fail('Cannot reserve from an empty deck.');
      }

      return resolveAfterMainAction(
        {
          ...state,
          bank: state.bank.gold > 0 ? addTokenCounts(state.bank, { gold: -1 }) : state.bank,
          decks: {
            ...state.decks,
            [tierKey]: reservedCard.deckIds,
          },
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          reservedCards: [...player.reservedCards, reservedCard.card],
          tokens: state.bank.gold > 0 ? addTokenCounts(player.tokens, { gold: 1 }) : player.tokens,
        }),
        state.nobles,
      );
    }

    case 'purchase-visible': {
      const visibleCard = findVisibleCard(state.market, move.cardId);

      if (!visibleCard) {
        return fail(`The requested visible card ${move.cardId} is not in the market.`);
      }

      const suggestedPayment = findAffordablePayment(player, visibleCard.card);

      if (!suggestedPayment || !isValidPaymentSelection(player, visibleCard.card, move.payment)) {
        return failInvalidPayment(move.cardId, move.payment, suggestedPayment);
      }

      const tierKey = ensureTierKey(visibleCard.tier);
      const marketReplacement = replaceMarketCard(
        state.market[tierKey],
        visibleCard.card.id,
        state.decks[tierKey],
      );

      return resolveAfterMainAction(
        {
          ...state,
          bank: addTokenCounts(state.bank, {
            white: move.payment.tokens.white,
            blue: move.payment.tokens.blue,
            green: move.payment.tokens.green,
            red: move.payment.tokens.red,
            black: move.payment.tokens.black,
            gold: move.payment.gold,
          }),
          market: {
            ...state.market,
            [tierKey]: marketReplacement.market,
          },
          decks: {
            ...state.decks,
            [tierKey]: marketReplacement.deckIds,
          },
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          tokens: applyPayment(player.tokens, move.payment),
          purchasedCards: [...player.purchasedCards, visibleCard.card],
        }),
        state.nobles,
      );
    }

    case 'purchase-reserved': {
      const purchasedCard = player.reservedCards.find((card) => card.id === move.cardId);

      if (!purchasedCard) {
        return fail('The requested reserved card is not held by the player.');
      }

      const suggestedPayment = findAffordablePayment(player, purchasedCard);

      if (!suggestedPayment || !isValidPaymentSelection(player, purchasedCard, move.payment)) {
        return failInvalidPayment(move.cardId, move.payment, suggestedPayment);
      }

      return resolveAfterMainAction(
        {
          ...state,
          bank: addTokenCounts(state.bank, {
            white: move.payment.tokens.white,
            blue: move.payment.tokens.blue,
            green: move.payment.tokens.green,
            red: move.payment.tokens.red,
            black: move.payment.tokens.black,
            gold: move.payment.gold,
          }),
        },
        replacePlayer(state.players, activePlayerIndex, {
          ...player,
          tokens: applyPayment(player.tokens, move.payment),
          reservedCards: player.reservedCards.filter((card) => card.id !== purchasedCard.id),
          purchasedCards: [...player.purchasedCards, purchasedCard],
        }),
        state.nobles,
      );
    }

    case 'claim-noble':
    case 'skip-noble':
    case 'discard-tokens':
      return fail('This move is not legal during the main-action phase.');
  }
};
