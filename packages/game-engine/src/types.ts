export const TOKEN_COLORS = ['white', 'blue', 'green', 'red', 'black'] as const;
export const GEM_COLORS = [...TOKEN_COLORS, 'gold'] as const;
export const CARD_TIERS = [1, 2, 3] as const;

export type TokenColor = (typeof TOKEN_COLORS)[number];
export type GemColor = (typeof GEM_COLORS)[number];
export type CardTier = (typeof CARD_TIERS)[number];
export type TargetScore = 15 | 16 | 17 | 18 | 19 | 20 | 21;
export type SeatCount = 2 | 3 | 4;

export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
}

export type TokenMap = Readonly<Record<GemColor, number>>;
export type CostMap = Readonly<Record<TokenColor, number>>;
export type BonusMap = Readonly<Record<TokenColor, number>>;

export interface Card {
  readonly id: string;
  readonly tier: CardTier;
  readonly points: number;
  readonly bonus: TokenColor;
  readonly cost: CostMap;
}

export interface Noble {
  readonly id: string;
  readonly points: number;
  readonly requirement: CostMap;
}

export interface PaymentSelection {
  readonly tokens: CostMap;
  readonly gold: number;
}

export interface GameConfig {
  readonly targetScore: TargetScore;
  readonly seatCount: SeatCount;
  readonly deckOrder?: Readonly<{
    tier1: readonly string[];
    tier2: readonly string[];
    tier3: readonly string[];
  }>;
  readonly nobleOrder?: readonly string[];
}

export interface SeededGameConfig {
  readonly targetScore: TargetScore;
  readonly seatCount: SeatCount;
}

export interface ShuffledSetup {
  readonly deckOrder: Readonly<{
    tier1: readonly string[];
    tier2: readonly string[];
    tier3: readonly string[];
  }>;
  readonly nobleOrder: readonly string[];
}

export interface PlayerState {
  readonly identity: PlayerIdentity;
  readonly tokens: TokenMap;
  readonly purchasedCards: readonly Card[];
  readonly reservedCards: readonly Card[];
  readonly nobles: readonly Noble[];
}

export interface GameResult {
  readonly winners: readonly string[];
  readonly winningScore: number;
  readonly tiedOnCards: boolean;
}

export type TurnKind = 'main-action' | 'discard' | 'noble';

export interface MainActionTurnState {
  readonly kind: 'main-action';
  readonly activePlayerIndex: number;
  readonly round: number;
}

export interface DiscardTurnState {
  readonly kind: 'discard';
  readonly activePlayerIndex: number;
  readonly round: number;
  readonly requiredCount: number;
}

export interface NobleTurnState {
  readonly kind: 'noble';
  readonly activePlayerIndex: number;
  readonly round: number;
  readonly eligibleNobleIds: readonly string[];
}

export type TurnState = MainActionTurnState | DiscardTurnState | NobleTurnState;

export interface GameState {
  readonly config: GameConfig;
  readonly status: 'in_progress' | 'finished';
  readonly turn: TurnState;
  readonly bank: TokenMap;
  readonly market: Readonly<Record<`tier${CardTier}`, readonly Card[]>>;
  readonly decks: Readonly<Record<`tier${CardTier}`, readonly string[]>>;
  readonly nobles: readonly Noble[];
  readonly players: readonly PlayerState[];
  readonly result?: GameResult;
}

export type Move =
  | {
      readonly type: 'take-distinct';
      readonly colors: readonly TokenColor[];
    }
  | {
      readonly type: 'take-pair';
      readonly color: TokenColor;
    }
  | {
      readonly type: 'reserve-visible';
      readonly cardId: string;
    }
  | {
      readonly type: 'reserve-deck';
      readonly tier: CardTier;
    }
  | {
      readonly type: 'purchase-visible';
      readonly cardId: string;
      readonly payment: PaymentSelection;
    }
  | {
      readonly type: 'purchase-reserved';
      readonly cardId: string;
      readonly payment: PaymentSelection;
    }
  | {
      readonly type: 'claim-noble';
      readonly nobleId: string;
    }
  | {
      readonly type: 'skip-noble';
    }
  | {
      readonly type: 'discard-tokens';
      readonly tokens: readonly GemColor[];
    };

export interface ReduceGameSuccess {
  readonly ok: true;
  readonly state: GameState;
}

export interface ReduceGameFailure {
  readonly ok: false;
  readonly error: {
    readonly message: string;
  };
}

export type ReduceGameResult = ReduceGameSuccess | ReduceGameFailure;

export interface Engine {
  readonly createShuffledSetup: (seed: string) => ShuffledSetup;
  readonly setupGame: (
    players: readonly PlayerIdentity[],
    config: GameConfig,
  ) => GameState;
  readonly setupGameWithSeed: (
    players: readonly PlayerIdentity[],
    config: SeededGameConfig,
    seed: string,
  ) => GameState;
  readonly listLegalMoves: (state: GameState) => readonly Move[];
  readonly reduceGame: (state: GameState, move: Move) => ReduceGameResult;
}
