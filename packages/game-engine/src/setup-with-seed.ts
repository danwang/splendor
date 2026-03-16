import { createShuffledSetup } from './randomness.js';
import { setupGame } from './setup.js';
import { type GameState, type PlayerIdentity, type SeededGameConfig } from './types.js';

export const setupGameWithSeed = (
  players: readonly PlayerIdentity[],
  config: SeededGameConfig,
  seed: string,
): GameState => {
  const shuffledSetup = createShuffledSetup(seed);

  return setupGame(players, {
    ...config,
    deckOrder: shuffledSetup.deckOrder,
    nobleOrder: shuffledSetup.nobleOrder,
  });
};
