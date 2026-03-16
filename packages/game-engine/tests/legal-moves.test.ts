import { describe, expect, it } from 'vitest';

import { listLegalMoves } from '../src/legal-moves.js';
import { setupGame } from '../src/setup.js';

describe('listLegalMoves', () => {
  it('offers opening token, reserve, and affordable purchase moves where applicable', () => {
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

    const legalMoves = listLegalMoves(state);

    expect(legalMoves.some((move) => move.type === 'take-distinct')).toBe(true);
    expect(legalMoves.some((move) => move.type === 'take-pair')).toBe(true);
    expect(legalMoves.some((move) => move.type === 'reserve-visible')).toBe(true);
    expect(legalMoves.some((move) => move.type === 'reserve-deck')).toBe(true);
  });
});
