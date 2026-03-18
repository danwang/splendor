import { type CSSProperties } from 'react';

export const animationTiming = {
  bulgeDurationMs: 320,
  cardArrivalDurationMs: 320,
  cardExpandDurationMs: 420,
  cardHoldPurchaseReservedMs: 400,
  cardHoldPurchaseVisibleMs: 100,
  cardHoldReserveVisibleMs: 100,
  flightDurationMs: 1_200,
  flipDurationMs: 320,
  purchaseCardStaggerMs: 250,
  purchaseReservedChipDelayMs: 200,
  reserveChipDurationMs: 420,
  scoreFlipDurationMs: 780,
  settleDurationMs: 900,
  turnHandoffGapMs: 200,
} as const;

export const animationCssVars = {
  '--anim-bulge-ms': `${animationTiming.bulgeDurationMs}ms`,
  '--anim-card-arrival-ms': `${animationTiming.cardArrivalDurationMs}ms`,
  '--anim-card-expand-ms': `${animationTiming.cardExpandDurationMs}ms`,
  '--anim-flight-ms': `${animationTiming.flightDurationMs}ms`,
  '--anim-flip-ms': `${animationTiming.flipDurationMs}ms`,
  '--anim-score-flip-ms': `${animationTiming.scoreFlipDurationMs}ms`,
  '--anim-settle-ms': `${animationTiming.settleDurationMs}ms`,
  '--anim-turn-gap-ms': `${animationTiming.turnHandoffGapMs}ms`,
} as CSSProperties;
