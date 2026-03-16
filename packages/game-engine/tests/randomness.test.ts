import { describe, expect, it } from 'vitest';

import { DEVELOPMENT_CARDS } from '../src/data/cards.js';
import { NOBLES } from '../src/data/nobles.js';
import { createShuffledSetup } from '../src/randomness.js';
import { setupGame } from '../src/setup.js';
import { setupGameWithSeed } from '../src/setup-with-seed.js';

const sortIds = (ids: readonly string[]): readonly string[] => [...ids].sort();

describe('createShuffledSetup', () => {
  it('is deterministic for the same seed and changes for a different seed', () => {
    const alphaOne = createShuffledSetup('alpha-seed');
    const alphaTwo = createShuffledSetup('alpha-seed');
    const beta = createShuffledSetup('beta-seed');

    expect(alphaOne).toEqual(alphaTwo);
    expect(beta).not.toEqual(alphaOne);
  });

  it('returns a complete shuffled set of card and noble ids', () => {
    const setup = createShuffledSetup('full-deck-check');
    const expectedTier1 = DEVELOPMENT_CARDS.filter((card) => card.tier === 1).map(
      (card) => card.id,
    );
    const expectedTier2 = DEVELOPMENT_CARDS.filter((card) => card.tier === 2).map(
      (card) => card.id,
    );
    const expectedTier3 = DEVELOPMENT_CARDS.filter((card) => card.tier === 3).map(
      (card) => card.id,
    );

    expect(sortIds(setup.deckOrder.tier1)).toEqual(sortIds(expectedTier1));
    expect(sortIds(setup.deckOrder.tier2)).toEqual(sortIds(expectedTier2));
    expect(sortIds(setup.deckOrder.tier3)).toEqual(sortIds(expectedTier3));
    expect(sortIds(setup.nobleOrder)).toEqual(sortIds(NOBLES.map((noble) => noble.id)));
  });

  it('can drive setupGame reproducibly through GameConfig', () => {
    const shuffled = createShuffledSetup('setup-seed');
    const state = setupGame(
      [
        { id: 'p1', displayName: 'Ada' },
        { id: 'p2', displayName: 'Grace' },
      ],
      {
        seatCount: 2,
        targetScore: 15,
        deckOrder: shuffled.deckOrder,
        nobleOrder: shuffled.nobleOrder,
      },
    );

    expect(state.market.tier1.map((card) => card.id)).toEqual(
      shuffled.deckOrder.tier1.slice(0, 4),
    );
    expect(state.decks.tier1).toEqual(shuffled.deckOrder.tier1.slice(4));
    expect(state.nobles.map((noble) => noble.id)).toEqual(shuffled.nobleOrder.slice(0, 3));
  });

  it('offers a seeded setup convenience helper', () => {
    const state = setupGameWithSeed(
      [
        { id: 'p1', displayName: 'Ada' },
        { id: 'p2', displayName: 'Grace' },
      ],
      {
        seatCount: 2,
        targetScore: 15,
      },
      'setup-helper-seed',
    );
    const sameState = setupGameWithSeed(
      [
        { id: 'p1', displayName: 'Ada' },
        { id: 'p2', displayName: 'Grace' },
      ],
      {
        seatCount: 2,
        targetScore: 15,
      },
      'setup-helper-seed',
    );

    expect(state.market.tier1.map((card) => card.id)).toEqual(
      sameState.market.tier1.map((card) => card.id),
    );
    expect(state.nobles.map((noble) => noble.id)).toEqual(
      sameState.nobles.map((noble) => noble.id),
    );
  });
});
