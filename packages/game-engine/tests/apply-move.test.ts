import { describe, expect, it } from 'vitest';

import { reduceGame } from '../src/apply-move.js';
import { addTokenCounts, createCostMap, createTokenMap } from '../src/helpers.js';
import { listLegalMoves } from '../src/legal-moves.js';
import { setupGame } from '../src/setup.js';
import { type GameState } from '../src/types.js';

const baseState = (): GameState =>
  setupGame(
    [
      { id: 'p1', displayName: 'Ada' },
      { id: 'p2', displayName: 'Grace' },
    ],
    {
      seatCount: 2,
      targetScore: 15,
    },
  );

describe('reduceGame', () => {
  it('takes three distinct tokens without mutating the previous state', () => {
    const state = baseState();
    const move = listLegalMoves(state).find(
      (entry) => entry.type === 'take-distinct' && entry.colors.length === 3,
    );

    expect(move).toBeDefined();

    const result = reduceGame(state, move!);

    expect(result.ok).toBe(true);

    if (result.ok) {
      const player = result.state.players[0]!;

      expect(
        player.tokens.white +
          player.tokens.blue +
          player.tokens.green +
          player.tokens.red +
          player.tokens.black,
      ).toBe(3);
      expect(state.players[0]?.tokens.white).toBe(0);
      expect(result.state.turn.activePlayerIndex).toBe(1);
    }
  });

  it('rejects taking a pair when the bank has fewer than four tokens of that color', () => {
    const state = {
      ...baseState(),
      bank: createTokenMap({
        white: 3,
        blue: 4,
        green: 4,
        red: 4,
        black: 4,
        gold: 5,
      }),
    };

    const result = reduceGame(state, { type: 'take-pair', color: 'white' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least four tokens');
    }
  });

  it('requires a legal payment for purchases', () => {
    const state = baseState();
    const card = state.market.tier1[0]!;
    const fundedPlayer = {
      ...state.players[0]!,
      tokens: addTokenCounts(createTokenMap(), {
        white: 5,
        blue: 5,
        green: 5,
        red: 5,
        black: 5,
      }),
    };
    const fundedState = {
      ...state,
      players: [fundedPlayer, state.players[1]!],
    };

    const result = reduceGame(fundedState, {
      type: 'purchase-visible',
      cardId: card.id,
      payment: {
        tokens: createCostMap({ white: 0, blue: 0, green: 0, red: 0, black: 0 }),
        gold: 0,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('does not legally purchase');
    }
  });

  it('allows paying with gold instead of an available colored token', () => {
    const state = baseState();
    const card = {
      ...state.market.tier1[0]!,
      cost: createCostMap({ blue: 1 }),
    };
    const fundedState = {
      ...state,
      market: {
        ...state.market,
        tier1: [card, ...state.market.tier1.slice(1)],
      },
      players: [
        {
          ...state.players[0]!,
          tokens: createTokenMap({ blue: 1, gold: 1 }),
        },
        state.players[1]!,
      ],
    };

    const result = reduceGame(fundedState, {
      type: 'purchase-visible',
      cardId: card.id,
      payment: {
        tokens: createCostMap(),
        gold: 1,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players[0]?.tokens).toEqual(createTokenMap({ blue: 1 }));
      expect(result.state.bank.gold).toBe(6);
    }
  });

  it('allows reserving a card and taking gold when available', () => {
    const state = baseState();
    const move = listLegalMoves(state).find((entry) => entry.type === 'reserve-visible');

    expect(move).toBeDefined();

    const result = reduceGame(state, move!);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.players[0]?.reservedCards).toHaveLength(1);
      expect(result.state.players[0]?.tokens.gold).toBe(1);
      expect(result.state.bank.gold).toBe(4);
    }
  });
});
