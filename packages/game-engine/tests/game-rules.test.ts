import { describe, expect, it } from 'vitest';

import { reduceGame } from '../src/apply-move.js';
import { NOBLES } from '../src/data/nobles.js';
import { createCostMap, createTokenMap } from '../src/helpers.js';
import { setupGame } from '../src/setup.js';
import { type GameState } from '../src/types.js';

const buildFinishedRoundState = (): GameState => {
  const state = setupGame(
    [
      { id: 'p1', displayName: 'Ada' },
      { id: 'p2', displayName: 'Grace' },
    ],
    {
      seatCount: 2,
      targetScore: 15,
    },
  );
  const pointsCard = {
    id: 'custom-points',
    tier: 1 as const,
    points: 1,
    bonus: 'white' as const,
    cost: createCostMap(),
  };

  return {
    ...state,
    turn: {
      ...state.turn,
      activePlayerIndex: 1,
    },
    market: {
      ...state.market,
      tier1: [pointsCard, ...state.market.tier1.slice(1)],
    },
    players: [
      state.players[0]!,
      {
        ...state.players[1]!,
        purchasedCards: Array.from({ length: 14 }, (_, index) => ({
          id: `p2-card-${index}`,
          tier: 1 as const,
          points: 1,
          bonus: 'blue' as const,
          cost: createCostMap(),
        })),
        tokens: createTokenMap({ gold: 1 }),
      },
    ],
  };
};

describe('game rules', () => {
  it('claims the first available noble deterministically', () => {
    const state = setupGame(
      [
        { id: 'p1', displayName: 'Ada' },
        { id: 'p2', displayName: 'Grace' },
      ],
      {
        seatCount: 2,
        targetScore: 15,
        nobleOrder: NOBLES.map((noble) => noble.id),
      },
    );
    const freeCard = {
      id: 'claim-noble-card',
      tier: 1 as const,
      points: 0,
      bonus: 'blue' as const,
      cost: createCostMap(),
    };
    const boostedState = {
      ...state,
      market: {
        ...state.market,
        tier1: [freeCard, ...state.market.tier1.slice(1)],
      },
      players: [
        {
          ...state.players[0]!,
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
          ],
          tokens: createTokenMap(),
        },
        state.players[1]!,
      ],
    };

    const result = reduceGame(boostedState, {
      type: 'purchase-visible',
      cardId: freeCard.id,
      payment: { tokens: createCostMap(), gold: 0 },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.turn.kind).toBe('noble');
      if (result.state.turn.kind !== 'noble') {
        throw new Error('Expected optional noble choice turn');
      }
      expect(result.state.turn.eligibleNobleIds).toContain('noble-1');

      const claimResult = reduceGame(result.state, {
        type: 'claim-noble',
        nobleId: 'noble-1',
      });

      expect(claimResult.ok).toBe(true);

      if (claimResult.ok) {
        expect(claimResult.state.players[0]?.nobles[0]?.id).toBe('noble-1');
      }
    }
  });

  it('ends the game only at the end of the round after reaching the target score', () => {
    const state = buildFinishedRoundState();

    const result = reduceGame(state, {
      type: 'purchase-visible',
      cardId: 'custom-points',
      payment: { tokens: createCostMap(), gold: 0 },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.state.status).toBe('finished');
      expect(result.state.result?.winners).toContain('p2');
    }
  });
});
