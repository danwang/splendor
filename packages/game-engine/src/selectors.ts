import {
  availableNoble,
  countCardsByBonus,
  findAffordablePayment,
  getEffectiveCost,
  getPlayerScore,
  isValidPaymentSelection,
  totalTokens,
} from './helpers.js';
import {
  type Card,
  type GameState,
  type Noble,
  type PaymentSelection,
  type PlayerState,
} from './types.js';

export const getActivePlayer = (state: GameState): PlayerState => {
  const player = state.players[state.turn.activePlayerIndex];

  if (!player) {
    throw new Error('Active player index is out of range.');
  }

  return player;
};

export const getAffordableCards = (
  player: PlayerState,
  cards: readonly Card[],
): readonly Card[] => cards.filter((card) => findAffordablePayment(player, card) !== null);

export const getAutoPayment = (
  player: PlayerState,
  card: Card,
): PaymentSelection | null => findAffordablePayment(player, card);

export const getCardEffectiveCost = (
  player: PlayerState,
  card: Card,
) => getEffectiveCost(player, card);

export const isValidPaymentForCard = (
  player: PlayerState,
  card: Card,
  payment: PaymentSelection,
): boolean => isValidPaymentSelection(player, card, payment);

export const getEligibleNoble = (
  player: PlayerState,
  nobles: readonly Noble[],
): Noble | null => availableNoble(player, nobles);

export const getPlayerBonuses = (player: PlayerState) => countCardsByBonus(player);

export const getPlayerTokenCount = (player: PlayerState): number => totalTokens(player.tokens);

export const getScoreboard = (state: GameState) =>
  state.players.map((player) => ({
    playerId: player.identity.id,
    displayName: player.identity.displayName,
    score: getPlayerScore(player),
    purchasedCards: player.purchasedCards.length,
    reservedCards: player.reservedCards.length,
    nobles: player.nobles.length,
  }));
