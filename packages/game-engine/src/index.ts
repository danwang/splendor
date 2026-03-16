import { reduceGame } from './apply-move.js';
import { listLegalMoves } from './legal-moves.js';
import { createShuffledSetup } from './randomness.js';
import { setupGame } from './setup.js';
import { setupGameWithSeed } from './setup-with-seed.js';

export { DEVELOPMENT_CARDS } from './data/cards.js';
export { NOBLES } from './data/nobles.js';
export * from './selectors.js';
export { createShuffledSetup, listLegalMoves, reduceGame, setupGame, setupGameWithSeed };
export * from './types.js';

export const engine = {
  createShuffledSetup,
  setupGame,
  setupGameWithSeed,
  listLegalMoves,
  reduceGame,
} as const;
