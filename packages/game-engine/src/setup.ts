import { drawCards, resolveCardDeckIds, resolveNobles, bankCountForSeatCount, createTokenMap } from './helpers.js';
import { type GameConfig, type GameState, type PlayerIdentity, type PlayerState } from './types.js';

export const setupGame = (
  players: readonly PlayerIdentity[],
  config: GameConfig,
): GameState => {
  if (players.length !== config.seatCount) {
    throw new Error(
      `Expected ${config.seatCount} players for setup, received ${players.length}.`,
    );
  }

  const tier1Deck = resolveCardDeckIds(1, config);
  const tier2Deck = resolveCardDeckIds(2, config);
  const tier3Deck = resolveCardDeckIds(3, config);
  const tier1Draw = drawCards(tier1Deck, 4);
  const tier2Draw = drawCards(tier2Deck, 4);
  const tier3Draw = drawCards(tier3Deck, 4);

  const playerStates: readonly PlayerState[] = players.map((player) => ({
    identity: player,
    tokens: createTokenMap(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
  }));

  return {
    config,
    status: 'in_progress',
    turn: {
      kind: 'main-action',
      activePlayerIndex: 0,
      round: 1,
    },
    bank: bankCountForSeatCount(config.seatCount),
    market: {
      tier1: tier1Draw.drawn,
      tier2: tier2Draw.drawn,
      tier3: tier3Draw.drawn,
    },
    decks: {
      tier1: tier1Draw.remaining,
      tier2: tier2Draw.remaining,
      tier3: tier3Draw.remaining,
    },
    nobles: resolveNobles(config),
    players: playerStates,
  };
};
