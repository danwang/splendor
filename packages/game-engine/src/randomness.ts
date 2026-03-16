import { DEVELOPMENT_CARDS } from './data/cards.js';
import { NOBLES } from './data/nobles.js';
import { CARD_TIERS, type CardTier, type ShuffledSetup } from './types.js';

const hashSeed = (seed: string): number =>
  Array.from(seed).reduce(
    (state, character) => Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );

const nextRandomState = (state: number): number => {
  let next = state + 0x6d2b79f5;

  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);

  return (next ^ (next >>> 14)) >>> 0;
};

const shuffleIds = (
  ids: readonly string[],
  initialState: number,
): { readonly ids: readonly string[]; readonly state: number } => {
  const output = [...ids];
  let state = initialState;

  for (let index = output.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state);

    const swapIndex = state % (index + 1);
    const current = output[index]!;

    output[index] = output[swapIndex]!;
    output[swapIndex] = current;
  }

  return {
    ids: output,
    state,
  };
};

const getTierCardIds = (tier: CardTier): readonly string[] =>
  DEVELOPMENT_CARDS.filter((card) => card.tier === tier).map((card) => card.id);

export const createShuffledSetup = (seed: string): ShuffledSetup => {
  const initialState = hashSeed(seed);
  const tier1 = shuffleIds(getTierCardIds(1), initialState);
  const tier2 = shuffleIds(getTierCardIds(2), tier1.state);
  const tier3 = shuffleIds(getTierCardIds(3), tier2.state);
  const nobles = shuffleIds(
    NOBLES.map((noble) => noble.id),
    tier3.state,
  );

  return {
    deckOrder: CARD_TIERS.reduce<ShuffledSetup['deckOrder']>(
      (order, tier) => ({
        ...order,
        [`tier${tier}`]:
          tier === 1 ? tier1.ids : tier === 2 ? tier2.ids : tier3.ids,
      }),
      {
        tier1: [],
        tier2: [],
        tier3: [],
      },
    ),
    nobleOrder: nobles.ids,
  };
};
