import {
  buildDiscardOptions,
  ensureTierKey,
  findAffordablePayment,
  uniqueDiscardOptions,
} from './helpers.js';
import { TOKEN_COLORS, type Card, type GameState, type Move, type PlayerState, type TokenColor } from './types.js';

const distinctColorCombinations = (
  colors: readonly TokenColor[],
): readonly (readonly TokenColor[])[] => {
  const combinations: TokenColor[][] = [];

  const visit = (startIndex: number, current: readonly TokenColor[]): void => {
    if (current.length > 0 && current.length <= 3) {
      combinations.push([...current]);
    }

    if (current.length === 3) {
      return;
    }

    colors.slice(startIndex).forEach((color, offset) => {
      visit(startIndex + offset + 1, [...current, color]);
    });
  };

  visit(0, []);
  return combinations;
};

const reserveMovesForMarket = (
  state: GameState,
  player: PlayerState,
): readonly Move[] =>
  ([1, 2, 3] as const).flatMap((tier) =>
    state.market[ensureTierKey(tier)].flatMap((card) =>
      player.reservedCards.length >= 3 ? [] : [{ type: 'reserve-visible', cardId: card.id }],
    ),
  );

const reserveMovesForDecks = (state: GameState, player: PlayerState): readonly Move[] =>
  ([1, 2, 3] as const).flatMap((tier) => {
    const tierKey = ensureTierKey(tier);

    if (state.decks[tierKey].length === 0) {
      return [];
    }

    return player.reservedCards.length >= 3 ? [] : [{ type: 'reserve-deck', tier }];
  });

const purchaseMovesForCards = (
  cards: readonly Card[],
  buildMove: (card: Card) => Move,
  player: PlayerState,
): readonly Move[] =>
  cards.flatMap((card) => {
    const payment = findAffordablePayment(player, card);

    if (!payment) {
      return [];
    }

    return [buildMove(card)];
  });

export const listLegalMoves = (state: GameState): readonly Move[] => {
  if (state.status === 'finished') {
    return [];
  }

  if (state.turn.kind === 'noble') {
    return [
      ...state.turn.eligibleNobleIds.map((nobleId) => ({
        type: 'claim-noble' as const,
        nobleId,
      })),
      { type: 'skip-noble' as const },
    ];
  }

  const player = state.players[state.turn.activePlayerIndex];

  if (!player) {
    return [];
  }

  if (state.turn.kind === 'discard') {
    return uniqueDiscardOptions(
      buildDiscardOptions(player.tokens, state.turn.requiredCount),
    ).map((tokens) => ({
      type: 'discard-tokens' as const,
      tokens,
    }));
  }

  const availableColors = TOKEN_COLORS.filter((color) => state.bank[color] > 0);
  const distinctMoves = distinctColorCombinations(availableColors).map((colors) => ({
    type: 'take-distinct' as const,
    colors,
  }));
  const pairMoves = TOKEN_COLORS.flatMap((color) => {
    if (state.bank[color] < 4) {
      return [];
    }

    return [{ type: 'take-pair' as const, color }];
  });
  const reserveMoves =
    player.reservedCards.length >= 3
      ? []
      : [...reserveMovesForMarket(state, player), ...reserveMovesForDecks(state, player)];
  const marketPurchases = ([1, 2, 3] as const).flatMap((tier) =>
    purchaseMovesForCards(
      state.market[ensureTierKey(tier)],
      (card) => ({
        type: 'purchase-visible',
        cardId: card.id,
        payment: findAffordablePayment(player, card)!,
      }),
      player,
    ),
  );
  const reservedPurchases = purchaseMovesForCards(
    player.reservedCards,
    (card) => ({
      type: 'purchase-reserved',
      cardId: card.id,
      payment: findAffordablePayment(player, card)!,
    }),
    player,
  );

  return [
    ...distinctMoves,
    ...pairMoves,
    ...reserveMoves,
    ...marketPurchases,
    ...reservedPurchases,
  ];
};
