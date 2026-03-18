import { useEffect, useMemo, useState } from 'react';

import {
  type AnimationCardFlight,
  type AnimationPhase,
  type AnimationPlan,
  type AnimationPrimitiveName,
  type AnimationTargetId,
  type AnimationTargetState,
  type ResolvedCardFlight,
  type ResolvedChipFlight,
} from './animation-types.js';
import { type PublicRoomState } from './types.js';

type ResolvedRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;

export interface AnimationPhaseRuntime {
  readonly activeTargets: AnimationTargetState;
  readonly cardFlights: readonly ResolvedCardFlight[];
  readonly chipFlights: readonly ResolvedChipFlight[];
  readonly phase: AnimationPhase | null;
}

export interface AnimationRunnerFrame {
  readonly activeTargets: AnimationTargetState;
  readonly cardFlights: readonly ResolvedCardFlight[];
  readonly chipFlights: readonly ResolvedChipFlight[];
  readonly currentPlan: AnimationPlan | null;
  readonly isAnimating: boolean;
  readonly phaseIndex: number;
  readonly presentedRoom: PublicRoomState | null;
}

export type AnimationTargetResolver = (targetId: AnimationTargetId) => ResolvedRect | null;

const emptyTargetState = (): AnimationTargetState => ({
  arriveCard: new Set(),
  bulge: new Set(),
  expandCard: new Set(),
  fadePlaceholder: new Set(),
  flipCard: new Set(),
  flipNumber: new Set(),
  highlightRow: new Set(),
});

const toTopLeft = (
  targetId: AnimationTargetId,
  rect: ResolvedRect,
  index: number,
): { readonly x: number; readonly y: number } => {
  if (targetId.startsWith('bank:')) {
    return {
      x: rect.left + rect.width / 2 - 14,
      y: rect.top + rect.height / 2 - 14,
    };
  }

  if (targetId.includes(':chips:')) {
    return {
      x: rect.left + Math.min(28 + index * 16, rect.width - 18),
      y: rect.top + rect.height / 2 - 14,
    };
  }

  return {
    x: rect.left,
    y: rect.top,
  };
};

const collectTargetIds = (
  state: AnimationTargetState,
  primitive: Exclude<
    AnimationPrimitiveName,
    'flight-card' | 'flight-chip' | 'wait'
  >,
  targets: readonly AnimationTargetId[],
): AnimationTargetState => {
  const nextState = {
    ...state,
    arriveCard: new Set(state.arriveCard),
    bulge: new Set(state.bulge),
    expandCard: new Set(state.expandCard),
    fadePlaceholder: new Set(state.fadePlaceholder),
    flipCard: new Set(state.flipCard),
    flipNumber: new Set(state.flipNumber),
    highlightRow: new Set(state.highlightRow),
  };

  for (const target of targets) {
    switch (primitive) {
      case 'arrive-card':
        nextState.arriveCard.add(target);
        break;
      case 'bulge':
        nextState.bulge.add(target);
        break;
      case 'expand-card':
        nextState.expandCard.add(target);
        break;
      case 'fade-placeholder':
        nextState.fadePlaceholder.add(target);
        break;
      case 'flip-card':
        nextState.flipCard.add(target);
        break;
      case 'flip-number':
        nextState.flipNumber.add(target);
        break;
      case 'highlight-row':
        nextState.highlightRow.add(target);
        break;
    }
  }

  return nextState;
};

const resolveCardFlights = (
  flights: readonly AnimationCardFlight[],
  resolveTargetRect: AnimationTargetResolver,
): readonly ResolvedCardFlight[] =>
  flights.flatMap((flight) => {
    const sourceRect = resolveTargetRect(flight.from);
    const targetRect = resolveTargetRect(flight.to);

    if (!sourceRect || !targetRect) {
      return [];
    }

  return [
      {
        fromX: sourceRect.left,
        fromY: sourceRect.top,
        id: flight.id,
        kind: flight.kind,
        ...(flight.card ? { card: flight.card } : {}),
        ...(flight.nobleId ? { nobleId: flight.nobleId } : {}),
        ...(flight.tier ? { tier: flight.tier } : {}),
        toX: targetRect.left,
        toY: targetRect.top,
      },
    ] satisfies readonly ResolvedCardFlight[];
  });

const resolveChipFlights = (
  flights: readonly import('./animation-types.js').AnimationChipFlight[],
  resolveTargetRect: AnimationTargetResolver,
): readonly ResolvedChipFlight[] => {
  const sourceCount = new Map<string, number>();
  const targetCount = new Map<string, number>();

  return flights.flatMap((flight) => {
    const sourceRect = resolveTargetRect(flight.from);
    const targetRect = resolveTargetRect(flight.to);

    if (!sourceRect || !targetRect) {
      return [];
    }

    const sourceIndex = sourceCount.get(flight.from) ?? 0;
    const targetIndex = targetCount.get(flight.to) ?? 0;
    sourceCount.set(flight.from, sourceIndex + 1);
    targetCount.set(flight.to, targetIndex + 1);

    const fromPoint = toTopLeft(flight.from, sourceRect, sourceIndex);
    const toPoint = toTopLeft(flight.to, targetRect, targetIndex);

    return [
      {
        color: flight.color,
        fromX: fromPoint.x,
        fromY: fromPoint.y,
        id: flight.id,
        toX: toPoint.x,
        toY: toPoint.y,
      },
    ] satisfies readonly ResolvedChipFlight[];
  });
};

const createPhaseRuntime = (
  phase: AnimationPhase | null,
  resolveTargetRect: AnimationTargetResolver,
): AnimationPhaseRuntime => {
  if (!phase) {
    return {
      activeTargets: emptyTargetState(),
      cardFlights: [],
      chipFlights: [],
      phase: null,
    };
  }

  return phase.steps.reduce<AnimationPhaseRuntime>(
    (runtime, step) => {
      switch (step.primitive) {
        case 'flight-card':
          return {
            ...runtime,
            cardFlights: resolveCardFlights(step.flights, resolveTargetRect),
          };
        case 'flight-chip':
          return {
            ...runtime,
            chipFlights: resolveChipFlights(step.flights, resolveTargetRect),
          };
        case 'wait':
          return runtime;
        default:
          return {
            ...runtime,
            activeTargets: collectTargetIds(runtime.activeTargets, step.primitive, step.targets),
          };
      }
    },
    {
      activeTargets: emptyTargetState(),
      cardFlights: [],
      chipFlights: [],
      phase,
    },
  );
};

export const createAnimationRunnerFrame = (
  room: PublicRoomState | null,
): AnimationRunnerFrame => ({
  activeTargets: emptyTargetState(),
  cardFlights: [],
  chipFlights: [],
  currentPlan: null,
  isAnimating: false,
  phaseIndex: -1,
  presentedRoom: room,
});

export const startAnimationPlan = (
  room: PublicRoomState | null,
  plan: AnimationPlan,
  resolveTargetRect: AnimationTargetResolver,
): AnimationRunnerFrame => {
  const firstPhase = plan.phases[0] ?? null;
  const runtime = createPhaseRuntime(firstPhase, resolveTargetRect);

  return {
    activeTargets: runtime.activeTargets,
    cardFlights: runtime.cardFlights,
    chipFlights: runtime.chipFlights,
    currentPlan: plan,
    isAnimating: true,
    phaseIndex: firstPhase ? 0 : -1,
    presentedRoom: firstPhase?.presentedRoom ?? room,
  };
};

export const advanceAnimationRunner = (
  frame: AnimationRunnerFrame,
  resolveTargetRect: AnimationTargetResolver,
): AnimationRunnerFrame => {
  const currentPlan = frame.currentPlan;

  if (!currentPlan) {
    return frame;
  }

  const nextPhase = currentPlan.phases[frame.phaseIndex + 1] ?? null;

  if (!nextPhase) {
    return {
      activeTargets: emptyTargetState(),
      cardFlights: [],
      chipFlights: [],
      currentPlan: null,
      isAnimating: false,
      phaseIndex: -1,
      presentedRoom: currentPlan.finalRoom,
    };
  }

  const runtime = createPhaseRuntime(nextPhase, resolveTargetRect);

  return {
    activeTargets: runtime.activeTargets,
    cardFlights: runtime.cardFlights,
    chipFlights: runtime.chipFlights,
    currentPlan,
    isAnimating: true,
    phaseIndex: frame.phaseIndex + 1,
    presentedRoom: nextPhase.presentedRoom,
  };
};

export const useAnimationRunner = ({
  canonicalRoom,
  derivePlan,
  initialPresentedRoom,
  resetKey,
  resolveTargetRect,
}: {
  readonly canonicalRoom: PublicRoomState | null;
  readonly derivePlan: (previousRoom: PublicRoomState | null, nextRoom: PublicRoomState | null) => AnimationPlan | null;
  readonly initialPresentedRoom?: PublicRoomState | null;
  readonly resetKey?: string;
  readonly resolveTargetRect: AnimationTargetResolver;
}): AnimationRunnerFrame => {
  const [frame, setFrame] = useState<AnimationRunnerFrame>(() =>
    createAnimationRunnerFrame(initialPresentedRoom ?? canonicalRoom),
  );

  useEffect(() => {
    setFrame(createAnimationRunnerFrame(initialPresentedRoom ?? canonicalRoom));
  }, [initialPresentedRoom, resetKey]);

  useEffect(() => {
    if (frame.currentPlan) {
      return;
    }

    const plan = derivePlan(frame.presentedRoom, canonicalRoom);

    if (!plan) {
      if (canonicalRoom?.stateVersion !== frame.presentedRoom?.stateVersion) {
        setFrame((current) => ({
          ...current,
          presentedRoom: canonicalRoom,
        }));
      }
      return;
    }

    setFrame(startAnimationPlan(frame.presentedRoom, plan, resolveTargetRect));
  }, [canonicalRoom, derivePlan, frame, resolveTargetRect]);

  useEffect(() => {
    const phase = frame.currentPlan?.phases[frame.phaseIndex];

    if (!phase) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFrame((current) => advanceAnimationRunner(current, resolveTargetRect));
    }, phase.durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [frame, resolveTargetRect]);

  return useMemo(() => frame, [frame]);
};
