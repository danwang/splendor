import { describe, expect, it } from 'vitest';

import { setupGame } from '../src/setup.js';

describe('setupGame', () => {
  it('creates the correct bank and visible cards for a two-player game', () => {
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

    expect(state.bank).toEqual({
      white: 4,
      blue: 4,
      green: 4,
      red: 4,
      black: 4,
      gold: 5,
    });
    expect(state.market.tier1).toHaveLength(4);
    expect(state.market.tier2).toHaveLength(4);
    expect(state.market.tier3).toHaveLength(4);
    expect(state.nobles).toHaveLength(3);
    expect(state.players[0]?.identity.displayName).toBe('Ada');
  });
});
