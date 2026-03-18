import { type Card, type CardTier, type GemColor } from '@splendor/game-engine';

import { type PublicRoomState } from './types.js';
import { type AnimationTargetId } from './animation-targets.js';

export type { AnimationTargetId } from './animation-targets.js';

export type AnimationPrimitiveName =
  | 'arrive-card'
  | 'bulge'
  | 'expand-card'
  | 'fade-placeholder'
  | 'flight-card'
  | 'flight-chip'
  | 'flip-card'
  | 'flip-number'
  | 'hold-card'
  | 'highlight-row'
  | 'land-card'
  | 'wait';

export type DerivedTransitionKind =
  | 'blind-reserve'
  | 'chip-take'
  | 'discard'
  | 'market-purchase'
  | 'noble-claim'
  | 'noble-skip'
  | 'no-op'
  | 'purchase-reserved'
  | 'reserve-visible'
  | 'unknown';

export interface AnimationCheckpoint {
  readonly id: 'departure' | 'arrival' | 'final';
  readonly room: PublicRoomState;
}

export interface AnimationChipFlight {
  readonly color: GemColor;
  readonly delayMs?: number;
  readonly durationMs?: number;
  readonly from: AnimationTargetId;
  readonly id: string;
  readonly to: AnimationTargetId;
}

export interface AnimationCardFlight {
  readonly card?: Card;
  readonly delayMs?: number;
  readonly durationMs?: number;
  readonly from: AnimationTargetId;
  readonly id: string;
  readonly kind:
    | 'noble'
    | 'purchase-reserved'
    | 'purchase-visible'
    | 'reserve-deck'
    | 'reserve-visible';
  readonly nobleId?: string;
  readonly to: AnimationTargetId;
  readonly tier?: CardTier;
}

export type AnimationStep =
  | {
      readonly primitive: 'arrive-card' | 'bulge' | 'expand-card' | 'fade-placeholder' | 'flip-card' | 'flip-number' | 'highlight-row';
      readonly targets: readonly AnimationTargetId[];
    }
  | {
      readonly primitive: 'hold-card' | 'land-card';
      readonly targets: readonly AnimationTargetId[];
    }
  | {
      readonly flights: readonly AnimationCardFlight[];
      readonly primitive: 'flight-card';
    }
  | {
      readonly flights: readonly AnimationChipFlight[];
      readonly primitive: 'flight-chip';
    }
  | {
      readonly flights: readonly AnimationChipFlight[];
      readonly primitive: 'flight-chip-short';
    }
  | {
      readonly primitive: 'wait';
    };

export interface AnimationPhase {
  readonly checkpointId: AnimationCheckpoint['id'];
  readonly durationMs: number;
  readonly id: string;
  readonly presentedRoom: PublicRoomState;
  readonly steps: readonly AnimationStep[];
}

export interface AnimationPlan {
  readonly checkpoints: readonly AnimationCheckpoint[];
  readonly finalRoom: PublicRoomState;
  readonly id: string;
  readonly kind: DerivedTransitionKind;
  readonly phases: readonly AnimationPhase[];
}

export interface AnimationTargetState {
  readonly arriveCard: ReadonlySet<AnimationTargetId>;
  readonly bulge: ReadonlySet<AnimationTargetId>;
  readonly expandCard: ReadonlySet<AnimationTargetId>;
  readonly fadePlaceholder: ReadonlySet<AnimationTargetId>;
  readonly flipCard: ReadonlySet<AnimationTargetId>;
  readonly flipNumber: ReadonlySet<AnimationTargetId>;
  readonly holdCard: ReadonlySet<AnimationTargetId>;
  readonly highlightRow: ReadonlySet<AnimationTargetId>;
  readonly landCard: ReadonlySet<AnimationTargetId>;
}

export interface ResolvedChipFlight {
  readonly color: GemColor;
  readonly delayMs?: number;
  readonly durationMs?: number;
  readonly from: AnimationTargetId;
  readonly fromX: number;
  readonly fromY: number;
  readonly id: string;
  readonly speed: 'normal' | 'short';
  readonly to: AnimationTargetId;
  readonly toX: number;
  readonly toY: number;
}

export interface ResolvedCardFlight {
  readonly card?: Card;
  readonly delayMs?: number;
  readonly durationMs?: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly id: string;
  readonly kind: AnimationCardFlight['kind'];
  readonly nobleId?: string;
  readonly toX: number;
  readonly toY: number;
  readonly tier?: CardTier;
}
