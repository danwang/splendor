import { CARDS_BY_ID, DEVELOPMENT_CARDS, STARTING_BONUSES } from './data/cards.js';
import { NOBLES, NOBLES_BY_ID } from './data/nobles.js';
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type BonusMap,
  type Card,
  type CardTier,
  type CostMap,
  type GameConfig,
  type GameResult,
  type GemColor,
  type Noble,
  type PaymentSelection,
  type PlayerState,
  type TokenColor,
  type TokenMap,
} from './types.js';

export const createTokenMap = (
  overrides: Partial<Record<GemColor, number>> = {},
): TokenMap => ({
  white: overrides.white ?? 0,
  blue: overrides.blue ?? 0,
  green: overrides.green ?? 0,
  red: overrides.red ?? 0,
  black: overrides.black ?? 0,
  gold: overrides.gold ?? 0,
});

export const createCostMap = (
  overrides: Partial<Record<TokenColor, number>> = {},
): CostMap => ({
  white: overrides.white ?? 0,
  blue: overrides.blue ?? 0,
  green: overrides.green ?? 0,
  red: overrides.red ?? 0,
  black: overrides.black ?? 0,
});

export const totalTokens = (tokens: TokenMap): number =>
  GEM_COLORS.reduce((sum, color) => sum + tokens[color], 0);

export const countCardsByBonus = (player: PlayerState): BonusMap =>
  player.purchasedCards.reduce<BonusMap>(
    (bonusMap, card) => ({
      ...bonusMap,
      [card.bonus]: bonusMap[card.bonus] + 1,
    }),
    STARTING_BONUSES,
  );

export const getPlayerScore = (player: PlayerState): number =>
  player.purchasedCards.reduce((sum, card) => sum + card.points, 0) +
  player.nobles.reduce((sum, noble) => sum + noble.points, 0);

export const bankCountForSeatCount = (seatCount: GameConfig['seatCount']): TokenMap => {
  const coloredCount = seatCount === 2 ? 4 : seatCount === 3 ? 5 : 7;

  return createTokenMap(
    TOKEN_COLORS.reduce<Partial<Record<GemColor, number>>>(
      (accumulator, color) => ({
        ...accumulator,
        [color]: coloredCount,
      }),
      { gold: 5 },
    ),
  );
};

export const getDeckForTier = (tier: CardTier): readonly Card[] =>
  DEVELOPMENT_CARDS.filter((card) => card.tier === tier);

export const resolveCardDeckIds = (tier: CardTier, config: GameConfig): readonly string[] => {
  const key = `tier${tier}` as const;
  const provided = config.deckOrder?.[key];

  if (provided) {
    return [...provided];
  }

  return getDeckForTier(tier).map((card) => card.id);
};

export const resolveNobles = (config: GameConfig): readonly Noble[] => {
  const orderedIds = config.nobleOrder ?? NOBLES.map((noble) => noble.id);

  return orderedIds
    .slice(0, config.seatCount + 1)
    .map((nobleId) => {
      const noble = NOBLES_BY_ID.get(nobleId);

      if (!noble) {
        throw new Error(`Unknown noble id: ${nobleId}`);
      }

      return noble;
    });
};

export const drawCards = (
  deckIds: readonly string[],
  amount: number,
): { readonly drawn: readonly Card[]; readonly remaining: readonly string[] } => {
  const drawnIds = deckIds.slice(0, amount);
  const drawn = drawnIds.map((cardId) => {
    const card = CARDS_BY_ID.get(cardId);

    if (!card) {
      throw new Error(`Unknown card id: ${cardId}`);
    }

    return card;
  });

  return {
    drawn,
    remaining: deckIds.slice(amount),
  };
};

export const findAffordablePayment = (
  player: PlayerState,
  card: Card,
): PaymentSelection | null => {
  const required = getEffectiveCost(player, card);

  const goldNeeded = TOKEN_COLORS.reduce((sum, color) => {
    const deficit = Math.max(0, required[color] - player.tokens[color]);

    return sum + deficit;
  }, 0);

  if (goldNeeded > player.tokens.gold) {
    return null;
  }

  return {
    tokens: TOKEN_COLORS.reduce(
      (tokens, color) => ({
        ...tokens,
        [color]: Math.min(required[color], player.tokens[color]),
      }),
      createCostMap(),
    ),
    gold: goldNeeded,
  };
};

export const getEffectiveCost = (
  player: PlayerState,
  card: Card,
): CostMap => {
  const bonuses = countCardsByBonus(player);

  return TOKEN_COLORS.reduce(
    (cost, color) => ({
      ...cost,
      [color]: Math.max(0, card.cost[color] - bonuses[color]),
    }),
    createCostMap(),
  );
};

export const isValidPaymentSelection = (
  player: PlayerState,
  card: Card,
  payment: PaymentSelection,
): boolean => {
  const required = getEffectiveCost(player, card);

  if (payment.gold > player.tokens.gold) {
    return false;
  }

  if (
    TOKEN_COLORS.some(
      (color) =>
        payment.tokens[color] < 0 ||
        payment.tokens[color] > player.tokens[color] ||
        payment.tokens[color] > required[color],
    )
  ) {
    return false;
  }

  const remainingCost = TOKEN_COLORS.reduce((sum, color) => {
    return sum + Math.max(0, required[color] - payment.tokens[color]);
  }, 0);

  return remainingCost === payment.gold;
};

export const paymentEquals = (
  left: PaymentSelection,
  right: PaymentSelection,
): boolean =>
  left.gold === right.gold &&
  TOKEN_COLORS.every((color) => left.tokens[color] === right.tokens[color]);

export const applyPayment = (tokens: TokenMap, payment: PaymentSelection): TokenMap =>
  createTokenMap(
    GEM_COLORS.reduce<Partial<Record<GemColor, number>>>(
      (accumulator, color) => ({
        ...accumulator,
        [color]:
          tokens[color] -
          (color === 'gold' ? payment.gold : payment.tokens[color as TokenColor]),
      }),
      {},
    ),
  );

export const addTokenCounts = (
  original: TokenMap,
  delta: Partial<Record<GemColor, number>>,
): TokenMap =>
  createTokenMap(
    GEM_COLORS.reduce<Partial<Record<GemColor, number>>>(
      (accumulator, color) => ({
        ...accumulator,
        [color]: original[color] + (delta[color] ?? 0),
      }),
      {},
    ),
  );

export const createDiscardSummary = (
  discards: readonly GemColor[],
): Readonly<Partial<Record<GemColor, number>>> =>
  discards.reduce<Partial<Record<GemColor, number>>>(
    (accumulator, color) => ({
      ...accumulator,
      [color]: (accumulator[color] ?? 0) + 1,
    }),
    {},
  );

export const buildDiscardOptions = (
  tokens: TokenMap,
  overflow: number,
): readonly (readonly GemColor[])[] => {
  if (overflow === 0) {
    return [[]];
  }

  const options = GEM_COLORS.filter((color) => tokens[color] > 0);

  return options.flatMap((color) =>
    buildDiscardOptions(
      addTokenCounts(tokens, { [color]: -1 }),
      overflow - 1,
    ).map((tail) => [color, ...tail] as const),
  );
};

export const uniqueDiscardOptions = (
  options: readonly (readonly GemColor[])[],
): readonly (readonly GemColor[])[] => {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = [...option].sort().join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const findCardInMarket = (
  market: readonly Card[],
  cardId: string,
): Card | undefined => market.find((card) => card.id === cardId);

export const findVisibleCard = (
  market: Readonly<Record<`tier${CardTier}`, readonly Card[]>>,
  cardId: string,
): { readonly tier: CardTier; readonly card: Card } | null => {
  const tierKeys = [
    ['tier1', 1],
    ['tier2', 2],
    ['tier3', 3],
  ] as const;

  for (const [tierKey, tier] of tierKeys) {
    const card = findCardInMarket(market[tierKey], cardId);

    if (card) {
      return { tier, card };
    }
  }

  return null;
};

export const replaceMarketCard = (
  market: readonly Card[],
  removedId: string,
  deckIds: readonly string[],
): { readonly market: readonly Card[]; readonly deckIds: readonly string[] } => {
  const remainingMarket = market.filter((card) => card.id !== removedId);
  const nextCardId = deckIds[0];

  if (!nextCardId) {
    return { market: remainingMarket, deckIds };
  }

  const nextCard = CARDS_BY_ID.get(nextCardId);

  if (!nextCard) {
    throw new Error(`Unknown card id: ${nextCardId}`);
  }

  return {
    market: [...remainingMarket, nextCard],
    deckIds: deckIds.slice(1),
  };
};

export const takeTopDeckCard = (
  deckIds: readonly string[],
): { readonly card: Card | null; readonly deckIds: readonly string[] } => {
  const topId = deckIds[0];

  if (!topId) {
    return { card: null, deckIds };
  }

  const card = CARDS_BY_ID.get(topId);

  if (!card) {
    throw new Error(`Unknown card id: ${topId}`);
  }

  return { card, deckIds: deckIds.slice(1) };
};

export const availableNoble = (
  player: PlayerState,
  nobles: readonly Noble[],
): Noble | null => {
  const bonuses = countCardsByBonus(player);

  return (
    nobles.find((noble) =>
      TOKEN_COLORS.every((color) => bonuses[color] >= noble.requirement[color]),
    ) ?? null
  );
};

export const availableNobles = (
  player: PlayerState,
  nobles: readonly Noble[],
): readonly Noble[] => {
  const bonuses = countCardsByBonus(player);

  return nobles.filter((noble) =>
    TOKEN_COLORS.every((color) => bonuses[color] >= noble.requirement[color]),
  );
};

export const resolveGameResult = (players: readonly PlayerState[]): GameResult | null => {
  const scores = players.map((player) => ({
    playerId: player.identity.id,
    score: getPlayerScore(player),
    cardCount: player.purchasedCards.length,
  }));
  const maxScore = Math.max(...scores.map((entry) => entry.score));
  const contenders = scores.filter((entry) => entry.score === maxScore);

  if (contenders.length === 0) {
    return null;
  }

  const minCardCount = Math.min(...contenders.map((entry) => entry.cardCount));
  const winners = contenders
    .filter((entry) => entry.cardCount === minCardCount)
    .map((entry) => entry.playerId);

  return {
    winners,
    winningScore: maxScore,
    tiedOnCards: winners.length > 1,
  };
};

export const ensureTierKey = (tier: CardTier): `tier${CardTier}` =>
  `tier${tier}` as `tier${CardTier}`;

export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${String(value)}`);
};
