import { describe, expect, it } from 'vitest';

import { reduceGame } from '../src/apply-move.js';
import { createCostMap, createTokenMap } from '../src/helpers.js';
import { setupGame } from '../src/setup.js';
import { type Card, type GameState } from '../src/types.js';

const buildPlayers = () =>
  [
    { id: 'p1', displayName: 'Ada' },
    { id: 'p2', displayName: 'Grace' },
  ] as const;

const buildState = (): GameState =>
  setupGame(buildPlayers(), {
    seatCount: 2,
    targetScore: 15,
  });

const replaceTierOnePrefix = (state: GameState, cards: readonly Card[]): GameState => ({
  ...state,
  market: {
    ...state.market,
    tier1: [...cards, ...state.market.tier1.slice(cards.length)],
  },
});

describe('engine scenarios', () => {
  it('handles overflow discard after taking three distinct tokens', () => {
    const seededState = buildState();
    const state: GameState = {
      ...seededState,
      players: [
        {
          ...seededState.players[0]!,
          tokens: createTokenMap({
            white: 2,
            blue: 2,
            green: 2,
            red: 2,
            black: 1,
          }),
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'take-distinct',
      colors: ['white', 'blue', 'green'],
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.turn.kind).toBe('discard');
      const discardResult = reduceGame(result.state, {
        type: 'discard-tokens',
        tokens: ['red', 'black'],
      });

      expect(discardResult.ok).toBe(true);

      if (discardResult.ok) {
        expect(discardResult.state.players[0]?.tokens).toEqual(
          createTokenMap({
            white: 3,
            blue: 3,
            green: 3,
            red: 1,
          }),
        );
        expect(discardResult.state.bank).toEqual(
          createTokenMap({
            white: 3,
            blue: 3,
            green: 3,
            red: 5,
            black: 5,
            gold: 5,
          }),
        );
        expect(discardResult.state.turn.kind).toBe('main-action');
        expect(discardResult.state.turn.activePlayerIndex).toBe(1);
      }
    }
  });

  it('handles overflow discard after taking a pair', () => {
    const seededState = buildState();
    const state: GameState = {
      ...seededState,
      players: [
        {
          ...seededState.players[0]!,
          tokens: createTokenMap({
            white: 3,
            blue: 2,
            green: 2,
            red: 2,
            black: 1,
          }),
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'take-pair',
      color: 'white',
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.turn.kind).toBe('discard');
      const discardResult = reduceGame(result.state, {
        type: 'discard-tokens',
        tokens: ['blue', 'black'],
      });

      expect(discardResult.ok).toBe(true);

      if (discardResult.ok) {
        expect(discardResult.state.players[0]?.tokens).toEqual(
          createTokenMap({
            white: 5,
            blue: 1,
            green: 2,
            red: 2,
          }),
        );
        expect(discardResult.state.bank).toEqual(
          createTokenMap({
            white: 2,
            blue: 5,
            green: 4,
            red: 4,
            black: 5,
            gold: 5,
          }),
        );
        expect(discardResult.state.turn.kind).toBe('main-action');
        expect(discardResult.state.turn.activePlayerIndex).toBe(1);
      }
    }
  });

  it('handles reserve overflow, discard, and later purchase from reserve', () => {
    const reserveTarget: Card = {
      id: 'reserve-target',
      tier: 1,
      points: 1,
      bonus: 'blue',
      cost: createCostMap({ white: 2, green: 1 }),
    };
    const seededState = buildState();
    const state = replaceTierOnePrefix(
      {
        ...seededState,
        players: [
          {
            ...seededState.players[0]!,
            tokens: createTokenMap({
              white: 2,
              blue: 2,
              green: 2,
              red: 2,
              black: 2,
            }),
          },
          seededState.players[1]!,
        ],
      },
      [reserveTarget],
    );

    const reserveResult = reduceGame(state, {
      type: 'reserve-visible',
      cardId: reserveTarget.id,
    });

    expect(reserveResult.ok).toBe(true);

    if (!reserveResult.ok) {
      return;
    }

    const reservedPlayer = reserveResult.state.players[0]!;
    expect(reservedPlayer.reservedCards.map((card) => card.id)).toContain(reserveTarget.id);
    expect(reservedPlayer.tokens.gold).toBe(1);
    expect(reservedPlayer.tokens.black).toBe(2);
    expect(reserveResult.state.turn.kind).toBe('discard');

    const discardReserveResult = reduceGame(reserveResult.state, {
      type: 'discard-tokens',
      tokens: ['black'],
    });

    expect(discardReserveResult.ok).toBe(true);

    if (!discardReserveResult.ok) {
      return;
    }

    expect(discardReserveResult.state.bank).toEqual(
      createTokenMap({
        white: 4,
        blue: 4,
        green: 4,
        red: 4,
        black: 5,
        gold: 4,
      }),
    );

    const repointedTurnState: GameState = {
      ...discardReserveResult.state,
      turn: {
        ...discardReserveResult.state.turn,
        activePlayerIndex: 0,
      },
    };

    const purchaseResult = reduceGame(repointedTurnState, {
      type: 'purchase-reserved',
      cardId: reserveTarget.id,
      payment: {
        tokens: createCostMap({ white: 2, green: 1 }),
        gold: 0,
      },
    });

    expect(purchaseResult.ok).toBe(true);

    if (purchaseResult.ok) {
      const purchasedPlayer = purchaseResult.state.players[0]!;

      expect(purchasedPlayer.reservedCards).toHaveLength(0);
      expect(purchasedPlayer.purchasedCards.map((card) => card.id)).toContain(
        reserveTarget.id,
      );
      expect(purchasedPlayer.tokens).toEqual(
        createTokenMap({
          blue: 2,
          green: 1,
          red: 2,
          black: 1,
          gold: 1,
        }),
      );
      expect(purchaseResult.state.turn.kind).toBe('main-action');
      expect(purchaseResult.state.turn.activePlayerIndex).toBe(1);
    }
  });

  it('refills the purchased market slot in place instead of shifting the row', () => {
    const seededState = buildState();
    const originalTierOne = seededState.market.tier1;
    const nextDeckCardId = seededState.decks.tier1[0]!;
    const purchasedCardId = originalTierOne[1]!.id;

    const state: GameState = {
      ...seededState,
      players: [
        {
          ...seededState.players[0]!,
          tokens: createTokenMap({
            white: 4,
            blue: 4,
            green: 4,
            red: 4,
            black: 4,
          }),
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'purchase-visible',
      cardId: purchasedCardId,
      payment: {
        tokens: originalTierOne[1]!.cost,
        gold: 0,
      },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.market.tier1[0]!.id).toBe(originalTierOne[0]!.id);
    expect(result.state.market.tier1[1]!.id).toBe(nextDeckCardId);
    expect(result.state.market.tier1[2]!.id).toBe(originalTierOne[2]!.id);
    expect(result.state.market.tier1[3]!.id).toBe(originalTierOne[3]!.id);
  });

  it('supports payment with permanent discounts plus gold', () => {
    const expensiveCard: Card = {
      id: 'discount-gold-card',
      tier: 2,
      points: 2,
      bonus: 'red',
      cost: createCostMap({
        white: 3,
        blue: 2,
        green: 1,
      }),
    };
    const seededState = buildState();
    const state: GameState = {
      ...seededState,
      market: {
        ...seededState.market,
        tier2: [expensiveCard, ...seededState.market.tier2.slice(1)],
      },
      players: [
        {
          ...seededState.players[0]!,
          purchasedCards: [
            {
              id: 'bonus-white',
              tier: 1,
              points: 0,
              bonus: 'white',
              cost: createCostMap(),
            },
          ],
          tokens: createTokenMap({
            white: 2,
            blue: 1,
            green: 1,
            gold: 1,
          }),
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'purchase-visible',
      cardId: expensiveCard.id,
      payment: {
        tokens: createCostMap({
          white: 2,
          blue: 1,
          green: 1,
        }),
        gold: 1,
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.players[0]?.purchasedCards.map((card) => card.id)).toContain(
        expensiveCard.id,
      );
      expect(result.state.players[0]?.tokens).toEqual(createTokenMap());
    }
  });

  it('rejects reserving when already holding three reserved cards', () => {
    const seededState = buildState();
    const state: GameState = {
      ...seededState,
      players: [
        {
          ...seededState.players[0]!,
          reservedCards: seededState.market.tier1.slice(0, 3),
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'reserve-visible',
      cardId: seededState.market.tier1[3]!.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('may not reserve more than three cards');
    }
  });

  it('rejects reserving from an empty deck', () => {
    const seededState = buildState();
    const state: GameState = {
      ...seededState,
      decks: {
        ...seededState.decks,
        tier1: [],
      },
    };

    const result = reduceGame(state, {
      type: 'reserve-deck',
      tier: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('empty deck');
    }
  });

  it('claims the first noble when a purchase makes multiple nobles available', () => {
    const claimCard: Card = {
      id: 'claim-two-nobles',
      tier: 1,
      points: 0,
      bonus: 'blue',
      cost: createCostMap(),
    };
    const seededState = setupGame(buildPlayers(), {
      seatCount: 2,
      targetScore: 15,
      nobleOrder: ['noble-1', 'noble-5', 'noble-6'],
    });
    const state: GameState = {
      ...replaceTierOnePrefix(seededState, [claimCard]),
      players: [
        {
          ...seededState.players[0]!,
          purchasedCards: [
            ...Array.from({ length: 4 }, (_, index) => ({
              id: `white-${index}`,
              tier: 1 as const,
              points: 0,
              bonus: 'white' as const,
              cost: createCostMap(),
            })),
            ...Array.from({ length: 3 }, (_, index) => ({
              id: `blue-${index}`,
              tier: 1 as const,
              points: 0,
              bonus: 'blue' as const,
              cost: createCostMap(),
            })),
            ...Array.from({ length: 4 }, (_, index) => ({
              id: `green-${index}`,
              tier: 1 as const,
              points: 0,
              bonus: 'green' as const,
              cost: createCostMap(),
            })),
          ],
        },
        seededState.players[1]!,
      ],
    };

    const result = reduceGame(state, {
      type: 'purchase-visible',
      cardId: claimCard.id,
      payment: { tokens: createCostMap(), gold: 0 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.turn.kind).toBe('noble');
      if (result.state.turn.kind !== 'noble') {
        throw new Error('Expected optional noble choice turn');
      }
      expect(result.state.turn.eligibleNobleIds).toEqual(['noble-1', 'noble-5']);

      const claimResult = reduceGame(result.state, {
        type: 'claim-noble',
        nobleId: 'noble-1',
      });

      expect(claimResult.ok).toBe(true);
      if (claimResult.ok) {
        expect(claimResult.state.players[0]?.nobles.map((noble) => noble.id)).toEqual([
          'noble-1',
        ]);
        expect(claimResult.state.turn.kind).toBe('main-action');
        expect(claimResult.state.turn.activePlayerIndex).toBe(1);
      }
    }
  });

  it('resolves final-round ties by fewest purchased cards', () => {
    const winningCard: Card = {
      id: 'winning-card',
      tier: 1,
      points: 1,
      bonus: 'green',
      cost: createCostMap(),
    };
    const setup = replaceTierOnePrefix(buildState(), [winningCard]);
    const state: GameState = {
      ...setup,
      turn: {
        ...setup.turn,
        activePlayerIndex: 1,
      },
      players: [
        {
          ...setup.players[0]!,
          purchasedCards: Array.from({ length: 9 }, (_, index) => ({
            id: `p1-${index}`,
            tier: 1 as const,
            points: index < 5 ? 3 : 0,
            bonus: 'white' as const,
            cost: createCostMap(),
          })),
        },
        {
          ...setup.players[1]!,
          purchasedCards: Array.from({ length: 7 }, (_, index) => ({
            id: `p2-${index}`,
            tier: 1 as const,
            points: 2,
            bonus: 'blue' as const,
            cost: createCostMap(),
          })),
        },
      ],
    };

    const result = reduceGame(state, {
      type: 'purchase-visible',
      cardId: winningCard.id,
      payment: {
        tokens: createCostMap(),
        gold: 0,
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.status).toBe('finished');
      expect(result.state.result).toEqual({
        winners: ['p2'],
        winningScore: 15,
        tiedOnCards: false,
      });
    }
  });

  it('wraps round order correctly in a three-player game and ends after the round closes', () => {
    const state = setupGame(
      [
        { id: 'p1', displayName: 'Ada' },
        { id: 'p2', displayName: 'Grace' },
        { id: 'p3', displayName: 'Linus' },
      ],
      {
        seatCount: 3,
        targetScore: 15,
      },
    );
    const finishingCard: Card = {
      id: 'three-player-finisher',
      tier: 1,
      points: 1,
      bonus: 'white',
      cost: createCostMap(),
    };
    const configuredState: GameState = {
      ...replaceTierOnePrefix(
        {
          ...state,
          turn: {
            ...state.turn,
            activePlayerIndex: 2,
          },
        },
        [finishingCard],
      ),
      players: [
        state.players[0]!,
        state.players[1]!,
        {
          ...state.players[2]!,
          purchasedCards: Array.from({ length: 14 }, (_, index) => ({
            id: `p3-card-${index}`,
            tier: 1 as const,
            points: 1,
            bonus: 'red' as const,
            cost: createCostMap(),
          })),
        },
      ],
    };

    const result = reduceGame(configuredState, {
      type: 'purchase-visible',
      cardId: finishingCard.id,
      payment: {
        tokens: createCostMap(),
        gold: 0,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.status).toBe('finished');
      expect(result.state.result?.winners).toEqual(['p3']);
      expect(result.state.turn.round).toBe(1);
    }
  });
});
