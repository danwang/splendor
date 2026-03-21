import { type Card, type GameState, type GemColor } from '@splendor/game-engine';

import { animationTiming } from './animation-config.js';
import { animationTargets } from './animation-targets.js';
import {
  type AnimationCardFlight,
  type AnimationCheckpoint,
  type AnimationChipFlight,
  type AnimationPhase,
  type AnimationPlan,
  type AnimationStep,
  type DerivedTransitionKind,
} from './animation-types.js';
import { gemOrder, cardTierOrder } from './game-ui.js';
import { deriveRoomAnimationState } from './room-activity.js';
import { type PublicRoomState } from './types.js';

const getActorPair = (
  previousGame: GameState,
  nextGame: GameState,
): {
  readonly nextActor: GameState['players'][number] | undefined;
  readonly previousActor: GameState['players'][number] | undefined;
} => {
  const previousActor = previousGame.players[previousGame.turn.activePlayerIndex];
  const nextActor = nextGame.players.find(
    (player) => player.identity.id === previousActor?.identity.id,
  );

  return {
    nextActor,
    previousActor,
  };
};

const createChipTransferPresentation = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): PublicRoomState => {
  if (!previousRoom.game || !nextRoom.game) {
    return previousRoom;
  }

  const previousGame = previousRoom.game;
  const nextGame = nextRoom.game;
  const { nextActor, previousActor } = getActorPair(previousGame, nextGame);

  if (!previousActor || !nextActor) {
    return previousRoom;
  }

  const actorDeltaByColor = gemOrder.reduce<Record<GemColor, number>>((result, color) => {
    return {
      ...result,
      [color]: nextActor.tokens[color] - previousActor.tokens[color],
    };
  }, {} as Record<GemColor, number>);

  const intermediatePlayers = previousGame.players.map((player) => {
    if (player.identity.id !== previousActor.identity.id) {
      return player;
    }

    return {
      ...player,
      tokens: gemOrder.reduce<Record<GemColor, number>>((result, color) => {
        const delta = actorDeltaByColor[color];

        return {
          ...result,
          [color]: delta < 0 ? nextActor.tokens[color] : previousActor.tokens[color],
        };
      }, {} as Record<GemColor, number>),
    };
  });

  const intermediateBank = gemOrder.reduce<Record<GemColor, number>>((result, color) => {
    const delta = actorDeltaByColor[color];

    return {
      ...result,
      [color]: delta > 0 ? nextGame.bank[color] : previousGame.bank[color],
    };
  }, {} as Record<GemColor, number>);

  return {
    ...previousRoom,
    game: {
      ...previousGame,
      bank: intermediateBank,
      players: intermediatePlayers,
    },
  };
};

const createReservedPurchaseDeparturePresentation = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): PublicRoomState => {
  const tokenTransferRoom = createChipTransferPresentation(previousRoom, nextRoom);

  if (!tokenTransferRoom.game || !previousRoom.game || !nextRoom.game) {
    return tokenTransferRoom;
  }

  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return tokenTransferRoom;
  }

  return {
    ...tokenTransferRoom,
    game: {
      ...tokenTransferRoom.game,
      players: tokenTransferRoom.game.players.map((player) =>
        player.identity.id === previousActor.identity.id
          ? {
              ...player,
              reservedCards: nextActor.reservedCards,
            }
          : player,
      ),
    },
  };
};

const createReservedPurchaseCardDeparturePresentation = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): PublicRoomState => {
  if (!previousRoom.game || !nextRoom.game) {
    return previousRoom;
  }

  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return previousRoom;
  }

  return {
    ...previousRoom,
    game: {
      ...previousRoom.game,
      players: previousRoom.game.players.map((player) =>
        player.identity.id === previousActor.identity.id
          ? {
              ...player,
              reservedCards: nextActor.reservedCards,
            }
          : player,
      ),
    },
  };
};

const createChipArrivalPresentation = (
  baseRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): PublicRoomState => {
  if (!baseRoom.game || !nextRoom.game) {
    return baseRoom;
  }

  const baseGame = baseRoom.game;
  const nextGame = nextRoom.game;
  const { nextActor, previousActor } = getActorPair(baseGame, nextGame);

  if (!previousActor || !nextActor) {
    return baseRoom;
  }

  return {
    ...baseRoom,
    game: {
      ...baseGame,
      bank: nextGame.bank,
      players: baseGame.players.map((player) =>
        player.identity.id === previousActor.identity.id
          ? {
              ...player,
              tokens: nextActor.tokens,
            }
          : player,
      ),
    },
  };
};

const createPostFlightPresentation = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): PublicRoomState => {
  if (
    !previousRoom.game ||
    !nextRoom.game ||
    previousRoom.status !== 'in_progress'
  ) {
    return nextRoom;
  }

  return {
    ...nextRoom,
    game: {
      ...nextRoom.game,
      turn: previousRoom.game.turn,
    },
  };
};

const buildCheckpoints = (
  departureRoom: PublicRoomState,
  arrivalRoom: PublicRoomState,
  finalRoom: PublicRoomState,
): readonly AnimationCheckpoint[] => [
  { id: 'departure', room: departureRoom },
  { id: 'arrival', room: arrivalRoom },
  { id: 'final', room: finalRoom },
];

const createSemanticId = (
  nextRoom: PublicRoomState,
  suffix: string,
): string => `${nextRoom.id}:${nextRoom.stateVersion}:${suffix}`;

const createChipFlights = (
  previousGame: GameState,
  nextGame: GameState,
): readonly AnimationChipFlight[] => {
  const { nextActor, previousActor } = getActorPair(previousGame, nextGame);

  if (!previousActor || !nextActor) {
    return [];
  }

  return gemOrder.flatMap((color) => {
    const delta = nextActor.tokens[color] - previousActor.tokens[color];

    if (delta === 0) {
      return [];
    }

    const count = Math.min(Math.abs(delta), 3);

    return Array.from({ length: count }, (_, index) => ({
      color,
      from:
        delta > 0
          ? animationTargets.bankChip(color)
          : animationTargets.playerChip(previousActor.identity.id, color),
      id: `${previousGame.turn.round}-${previousActor.identity.id}-${color}-${index}`,
      to:
        delta > 0
          ? animationTargets.playerChip(previousActor.identity.id, color)
          : animationTargets.bankChip(color),
    })) satisfies readonly AnimationChipFlight[];
  });
};

const createPurchaseFlight = (
  nextRoom: PublicRoomState,
  previousPlayer: GameState['players'][number],
  nextPlayer: GameState['players'][number],
  card: Card,
  flightIndex: number,
  options?: {
    readonly delayMs?: number;
    readonly durationMs?: number;
  },
): AnimationCardFlight => ({
  card,
  ...(options?.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
  ...(options?.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
  from: previousPlayer.reservedCards.some((entry) => entry.id === card.id)
    ? animationTargets.playerReserved(nextPlayer.identity.id)
    : animationTargets.marketCard(card.id),
  id: createSemanticId(nextRoom, `purchase-${card.id}-${flightIndex}`),
  kind: previousPlayer.reservedCards.some((entry) => entry.id === card.id)
    ? 'purchase-reserved'
    : 'purchase-visible',
  tier: card.tier,
  to: animationTargets.playerTableau(nextPlayer.identity.id),
});

const createReserveFlight = (
  nextRoom: PublicRoomState,
  previousGame: GameState,
  nextPlayer: GameState['players'][number],
  card: Card,
  flightIndex: number,
): AnimationCardFlight => {
  const wasVisibleInMarket = cardTierOrder.some((tier) =>
    previousGame.market[`tier${tier}`].some((entry) => entry.id === card.id),
  );

  return {
    card,
    from: wasVisibleInMarket
      ? animationTargets.marketCard(card.id)
      : animationTargets.deck(card.tier),
    id: createSemanticId(nextRoom, `reserve-${card.id}-${flightIndex}`),
    kind: wasVisibleInMarket ? 'reserve-visible' : 'reserve-deck',
    tier: card.tier,
    to: animationTargets.playerReserved(nextPlayer.identity.id),
  };
};

const createReserveChipFlights = (
  previousGame: GameState,
  nextGame: GameState,
): readonly AnimationChipFlight[] =>
  createChipFlights(previousGame, nextGame).map((flight) => ({
    ...flight,
    delayMs: 250,
    durationMs: animationTiming.flightDurationMs,
  }));

const createDelayedChipFlights = (
  previousGame: GameState,
  nextGame: GameState,
  delayMs: number,
): readonly AnimationChipFlight[] =>
  createChipFlights(previousGame, nextGame).map((flight) => ({
    ...flight,
    delayMs,
    durationMs: animationTiming.flightDurationMs,
  }));

const deriveTransitionKind = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): DerivedTransitionKind => {
  if (
    !previousRoom.game ||
    !nextRoom.game ||
    previousRoom.status !== 'in_progress'
  ) {
    return 'no-op';
  }

  const previousGame = previousRoom.game;
  const nextGame = nextRoom.game;
  const { nextActor, previousActor } = getActorPair(previousGame, nextGame);

  if (!previousActor || !nextActor) {
    return 'unknown';
  }

  const addedNobles = nextActor.nobles.filter(
    (noble) => !previousActor.nobles.some((entry) => entry.id === noble.id),
  );
  if (addedNobles.length > 0) {
    return 'noble-claim';
  }

  if (previousGame.turn.kind === 'noble' && nextGame.turn.kind !== 'noble') {
    return 'noble-skip';
  }

  const addedReservedCards = nextActor.reservedCards.filter(
    (card) => !previousActor.reservedCards.some((entry) => entry.id === card.id),
  );
  if (addedReservedCards.length > 0) {
    const reservedCard = addedReservedCards[0]!;
    const wasVisibleInMarket = cardTierOrder.some((tier) =>
      previousGame.market[`tier${tier}`].some((entry) => entry.id === reservedCard.id),
    );

    return wasVisibleInMarket ? 'reserve-visible' : 'blind-reserve';
  }

  const addedPurchasedCards = nextActor.purchasedCards.filter(
    (card) => !previousActor.purchasedCards.some((entry) => entry.id === card.id),
  );
  if (addedPurchasedCards.length > 0) {
    const purchasedCard = addedPurchasedCards[0]!;

    return previousActor.reservedCards.some((entry) => entry.id === purchasedCard.id)
      ? 'purchase-reserved'
      : 'market-purchase';
  }

  if (previousGame.turn.kind === 'discard') {
    return 'discard';
  }

  const tokenDelta = gemOrder.some(
    (color) => nextActor.tokens[color] !== previousActor.tokens[color],
  );
  if (previousGame.turn.kind === 'main-action' && tokenDelta) {
    return 'chip-take';
  }

  return 'unknown';
};

const createArrivalSteps = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
  actorId: string,
  extraSteps: readonly AnimationStep[],
): readonly AnimationStep[] => {
  const arrivalState = deriveRoomAnimationState(previousRoom, nextRoom);
  const steps: AnimationStep[] = [...extraSteps];

  const marketTargets = arrivalState.changedMarketCardIds.map((cardId) =>
    animationTargets.marketCard(cardId),
  );
  if (marketTargets.length > 0) {
    steps.push({
      primitive: 'arrive-card',
      targets: marketTargets,
    });
  }

  const deckTargets = arrivalState.changedDeckTiers.map((tier) => animationTargets.deck(tier));
  if (deckTargets.length > 0) {
    steps.push({
      primitive: 'bulge',
      targets: deckTargets,
    });
  }

  steps.push({
    primitive: 'highlight-row',
    targets: [animationTargets.playerRow(actorId)],
  });

  return steps;
};

const createFinalPhase = (
  nextRoom: PublicRoomState,
  presentedRoom: PublicRoomState = nextRoom,
  steps: readonly AnimationStep[] = [],
): AnimationPhase => ({
  checkpointId: 'final',
  durationMs: animationTiming.turnHandoffGapMs,
  id: createSemanticId(nextRoom, 'phase-final'),
  presentedRoom,
  steps,
});

const createWaitPhase = (
  nextRoom: PublicRoomState,
  checkpointId: AnimationCheckpoint['id'],
  presentedRoom: PublicRoomState,
  suffix: string,
  durationMs: number,
  steps: readonly AnimationStep[] = [{ primitive: 'wait' }],
): AnimationPhase => ({
  checkpointId,
  durationMs,
  id: createSemanticId(nextRoom, suffix),
  presentedRoom,
  steps,
});

const createChipTakePlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const departureRoom = createChipTransferPresentation(previousRoom, nextRoom);
  const arrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const sourceTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));
  const destinationTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));

  return {
    checkpoints: buildCheckpoints(departureRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'chip-take'),
    kind: 'chip-take',
    phases: [
      {
        checkpointId: 'departure',
        durationMs: animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          { primitive: 'bulge', targets: sourceTargets },
          { primitive: 'flight-chip', flights: createChipFlights(previousRoom.game, nextRoom.game) },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: arrivalRoom,
        steps: createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
          { primitive: 'bulge', targets: destinationTargets },
        ]),
      },
      createFinalPhase(nextRoom),
    ],
  };
};

const createDiscardPlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const departureRoom = createChipTransferPresentation(previousRoom, nextRoom);
  const arrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const sourceTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));
  const bankTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));

  return {
    checkpoints: buildCheckpoints(departureRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'discard'),
    kind: 'discard',
    phases: [
      {
        checkpointId: 'departure',
        durationMs: animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          { primitive: 'bulge', targets: sourceTargets },
          { primitive: 'flight-chip', flights: createChipFlights(previousRoom.game, nextRoom.game) },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: arrivalRoom,
        steps: createArrivalSteps(previousRoom, nextRoom, previousActor.identity.id, [
          { primitive: 'bulge', targets: bankTargets },
        ]),
      },
      createFinalPhase(nextRoom),
    ],
  };
};

const createReserveVisiblePlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const departureRoom = createChipTransferPresentation(previousRoom, nextRoom);
  const chipArrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const arrivalRoom = createPostFlightPresentation(previousRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const addedReservedCards = nextActor.reservedCards.filter(
    (card) => !previousActor.reservedCards.some((entry) => entry.id === card.id),
  );
  const reservedCard = addedReservedCards[0];

  if (!reservedCard) {
    return null;
  }

  const sourceBankTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));
  const destinationChipTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));

  return {
    checkpoints: buildCheckpoints(departureRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'reserve-visible'),
    kind: 'reserve-visible',
    phases: [
      {
        checkpointId: 'departure',
        durationMs:
          sourceBankTargets.length > 0
            ? animationTiming.flightDurationMs + 250
            : animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          ...(sourceBankTargets.length > 0
            ? [
                { primitive: 'bulge', targets: sourceBankTargets } as const,
                {
                  primitive: 'flight-chip',
                  flights: createReserveChipFlights(previousRoom.game, nextRoom.game),
                } as const,
              ]
            : []),
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(reservedCard.id)] },
          { primitive: 'flight-card', flights: [createReserveFlight(nextRoom, previousRoom.game, nextActor, reservedCard, 0)] },
        ],
      },
      createWaitPhase(
        nextRoom,
        'arrival',
        chipArrivalRoom,
        'phase-hold',
        Math.max(animationTiming.cardHoldReserveVisibleMs, animationTiming.bulgeDurationMs),
        [
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(reservedCard.id)] },
          ...(destinationChipTargets.length > 0
            ? [{ primitive: 'bulge', targets: destinationChipTargets } as const]
            : []),
          {
            primitive: 'hold-card',
            targets: [animationTargets.playerReserved(nextActor.identity.id)],
          },
        ],
      ),
      createWaitPhase(
        nextRoom,
        'arrival',
        chipArrivalRoom,
        'phase-flip',
        animationTiming.flipDurationMs,
        [
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(reservedCard.id)] },
          {
            primitive: 'flip-card',
            targets: [animationTargets.playerReserved(nextActor.identity.id)],
          },
        ],
      ),
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.cardArrivalDurationMs,
        id: createSemanticId(nextRoom, 'phase-land'),
        presentedRoom: chipArrivalRoom,
        steps: [
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(reservedCard.id)] },
          { primitive: 'land-card', targets: [animationTargets.playerReserved(nextActor.identity.id)] },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: arrivalRoom,
        steps: createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
          { primitive: 'bulge', targets: [animationTargets.playerReserved(nextActor.identity.id)] },
        ]),
      },
      createFinalPhase(nextRoom),
    ],
  };
};

const createBlindReservePlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const departureRoom = createChipTransferPresentation(previousRoom, nextRoom);
  const chipArrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const arrivalRoom = createPostFlightPresentation(previousRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const addedReservedCards = nextActor.reservedCards.filter(
    (card) => !previousActor.reservedCards.some((entry) => entry.id === card.id),
  );
  const reservedCard = addedReservedCards[0];

  if (!reservedCard) {
    return null;
  }

  const sourceBankTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));
  const destinationChipTargets = gemOrder
    .filter((color) => nextActor.tokens[color] > previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));

  return {
    checkpoints: buildCheckpoints(departureRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'reserve-deck'),
    kind: 'blind-reserve',
    phases: [
      {
        checkpointId: 'departure',
        durationMs:
          sourceBankTargets.length > 0
            ? animationTiming.flightDurationMs + 250
            : animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          ...(sourceBankTargets.length > 0
            ? [
                { primitive: 'bulge', targets: sourceBankTargets } as const,
                {
                  primitive: 'flight-chip',
                  flights: createReserveChipFlights(previousRoom.game, nextRoom.game),
                } as const,
              ]
            : []),
          { primitive: 'flight-card', flights: [createReserveFlight(nextRoom, previousRoom.game, nextActor, reservedCard, 0)] },
        ],
      },
      ...(destinationChipTargets.length > 0
        ? [
            {
              checkpointId: 'arrival' as const,
              durationMs: animationTiming.bulgeDurationMs,
              id: createSemanticId(nextRoom, 'phase-chip-arrival'),
              presentedRoom: chipArrivalRoom,
              steps: [
                { primitive: 'bulge' as const, targets: destinationChipTargets },
                {
                  primitive: 'hold-card' as const,
                  targets: [animationTargets.playerReserved(nextActor.identity.id)],
                },
              ],
            },
          ]
        : []),
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.cardArrivalDurationMs,
        id: createSemanticId(nextRoom, 'phase-land'),
        presentedRoom: destinationChipTargets.length > 0 ? chipArrivalRoom : departureRoom,
        steps: [
          { primitive: 'land-card', targets: [animationTargets.playerReserved(nextActor.identity.id)] },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: arrivalRoom,
        steps: createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
          { primitive: 'bulge', targets: [animationTargets.playerReserved(nextActor.identity.id)] },
        ]),
      },
      createFinalPhase(nextRoom),
    ],
  };
};

const createMarketPurchasePlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const departureRoom = createChipTransferPresentation(previousRoom, nextRoom);
  const chipArrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const arrivalRoom = createPostFlightPresentation(previousRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const addedPurchasedCards = nextActor.purchasedCards.filter(
    (card) => !previousActor.purchasedCards.some((entry) => entry.id === card.id),
  );
  const purchasedCard = addedPurchasedCards[0];

  if (!purchasedCard) {
    return null;
  }

  const sourcePlayerChipTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));
  const bankTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));

  return {
    checkpoints: buildCheckpoints(departureRoom, chipArrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'market-purchase'),
    kind: 'market-purchase',
    phases: [
      {
        checkpointId: 'departure',
        durationMs: animationTiming.flightDurationMs + animationTiming.purchaseCardStaggerMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          { primitive: 'bulge', targets: sourcePlayerChipTargets },
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(purchasedCard.id)] },
          {
            primitive: 'flight-card',
            flights: [
              createPurchaseFlight(nextRoom, previousActor, nextActor, purchasedCard, 0, {
                delayMs: animationTiming.purchaseCardStaggerMs,
                durationMs: animationTiming.flightDurationMs,
              }),
            ],
          },
          { primitive: 'flight-chip', flights: createChipFlights(previousRoom.game, nextRoom.game) },
        ],
      },
      createWaitPhase(
        nextRoom,
        'arrival',
        chipArrivalRoom,
        'phase-hold',
        Math.max(animationTiming.cardHoldPurchaseVisibleMs, animationTiming.bulgeDurationMs),
        [
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(purchasedCard.id)] },
          ...(bankTargets.length > 0 ? [{ primitive: 'bulge', targets: bankTargets } as const] : []),
          {
            primitive: 'hold-card',
            targets: [animationTargets.playerTableau(nextActor.identity.id)],
          },
        ],
      ),
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: chipArrivalRoom,
        steps: [
          { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(purchasedCard.id)] },
          { primitive: 'land-card', targets: [animationTargets.playerTableau(nextActor.identity.id)] },
          { primitive: 'bulge', targets: [animationTargets.playerTableau(nextActor.identity.id)] },
          { primitive: 'bulge', targets: [animationTargets.playerTableauBonus(nextActor.identity.id, purchasedCard.bonus)] },
          { primitive: 'flip-number', targets: [animationTargets.playerScore(nextActor.identity.id)] },
          { primitive: 'highlight-row', targets: [animationTargets.playerRow(nextActor.identity.id)] },
        ],
      },
      createFinalPhase(nextRoom, chipArrivalRoom, [
        { primitive: 'fade-placeholder', targets: [animationTargets.marketCard(purchasedCard.id)] },
      ]),
    ],
  };
};

const createPurchaseReservedPlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const cardDepartureRoom = createReservedPurchaseCardDeparturePresentation(previousRoom, nextRoom);
  const departureRoom = createReservedPurchaseDeparturePresentation(previousRoom, nextRoom);
  const chipArrivalRoom = createChipArrivalPresentation(departureRoom, nextRoom);
  const arrivalRoom = createPostFlightPresentation(previousRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const addedPurchasedCards = nextActor.purchasedCards.filter(
    (card) => !previousActor.purchasedCards.some((entry) => entry.id === card.id),
  );
  const purchasedCard = addedPurchasedCards[0];

  if (!purchasedCard) {
    return null;
  }

  const sourcePlayerChipTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.playerChip(nextActor.identity.id, color));
  const bankTargets = gemOrder
    .filter((color) => nextActor.tokens[color] < previousActor.tokens[color])
    .map((color) => animationTargets.bankChip(color));

  return {
    checkpoints: buildCheckpoints(departureRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'purchase-reserved'),
    kind: 'purchase-reserved',
    phases: [
      {
        checkpointId: 'departure',
        durationMs: animationTiming.cardExpandDurationMs,
        id: createSemanticId(nextRoom, 'phase-expand'),
        presentedRoom: cardDepartureRoom,
        steps: [
          { primitive: 'expand-card', targets: [animationTargets.playerReserved(nextActor.identity.id)] },
        ],
      },
      createWaitPhase(
        nextRoom,
        'departure',
        cardDepartureRoom,
        'phase-flip',
        animationTiming.flipDurationMs,
        [
          {
            primitive: 'flip-card',
            targets: [animationTargets.playerReserved(nextActor.identity.id)],
          },
        ],
      ),
      createWaitPhase(
        nextRoom,
        'departure',
        cardDepartureRoom,
        'phase-hold',
        animationTiming.cardHoldPurchaseReservedMs,
        [
          {
            primitive: 'hold-card',
            targets: [animationTargets.playerReserved(nextActor.identity.id)],
          },
        ],
      ),
      {
        checkpointId: 'departure',
        durationMs: animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: departureRoom,
        steps: [
          { primitive: 'bulge', targets: sourcePlayerChipTargets },
          {
            primitive: 'flight-card',
            flights: [createPurchaseFlight(nextRoom, previousActor, nextActor, purchasedCard, 0)],
          },
          {
            primitive: 'flight-chip',
            flights: createDelayedChipFlights(
              previousRoom.game,
              nextRoom.game,
              animationTiming.purchaseReservedChipDelayMs,
            ),
          },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: bankTargets.length > 0 ? animationTiming.bulgeDurationMs : animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, bankTargets.length > 0 ? 'phase-chip-arrival' : 'phase-arrival'),
        presentedRoom: bankTargets.length > 0 ? chipArrivalRoom : arrivalRoom,
        steps:
          bankTargets.length > 0
            ? [
                { primitive: 'bulge', targets: bankTargets },
                {
                  primitive: 'hold-card',
                  targets: [animationTargets.playerTableau(nextActor.identity.id)],
                },
              ]
            : createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
                { primitive: 'land-card', targets: [animationTargets.playerTableau(nextActor.identity.id)] },
                { primitive: 'bulge', targets: [animationTargets.playerTableau(nextActor.identity.id)] },
                { primitive: 'bulge', targets: [animationTargets.playerTableauBonus(nextActor.identity.id, purchasedCard.bonus)] },
                { primitive: 'flip-number', targets: [animationTargets.playerScore(nextActor.identity.id)] },
              ]),
      },
      ...(bankTargets.length > 0
        ? [
            {
              checkpointId: 'arrival' as const,
              durationMs: animationTiming.settleDurationMs,
              id: createSemanticId(nextRoom, 'phase-arrival'),
              presentedRoom: arrivalRoom,
              steps: createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
                { primitive: 'land-card' as const, targets: [animationTargets.playerTableau(nextActor.identity.id)] },
                { primitive: 'bulge' as const, targets: [animationTargets.playerTableau(nextActor.identity.id)] },
                {
                  primitive: 'bulge' as const,
                  targets: [animationTargets.playerTableauBonus(nextActor.identity.id, purchasedCard.bonus)],
                },
                { primitive: 'flip-number' as const, targets: [animationTargets.playerScore(nextActor.identity.id)] },
              ]),
            },
          ]
        : []),
      createFinalPhase(nextRoom),
    ],
  };
};

const createNobleClaimPlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan | null => {
  if (!previousRoom.game || !nextRoom.game) {
    return null;
  }

  const arrivalRoom = createPostFlightPresentation(previousRoom, nextRoom);
  const { nextActor, previousActor } = getActorPair(previousRoom.game, nextRoom.game);

  if (!previousActor || !nextActor) {
    return null;
  }

  const addedNobles = nextActor.nobles.filter(
    (noble) => !previousActor.nobles.some((entry) => entry.id === noble.id),
  );
  const noble = addedNobles[0];

  if (!noble) {
    return null;
  }

  return {
    checkpoints: buildCheckpoints(previousRoom, arrivalRoom, nextRoom),
    finalRoom: nextRoom,
    id: createSemanticId(nextRoom, 'noble-claim'),
    kind: 'noble-claim',
    phases: [
      {
        checkpointId: 'departure',
        durationMs: animationTiming.flightDurationMs,
        id: createSemanticId(nextRoom, 'phase-departure'),
        presentedRoom: previousRoom,
        steps: [
          {
            primitive: 'flight-card',
            flights: [
              {
                from: animationTargets.viewportNobleOrigin(),
                id: createSemanticId(nextRoom, `noble-${noble.id}`),
                kind: 'noble',
                nobleId: noble.id,
                to: animationTargets.playerNobles(nextActor.identity.id),
              },
            ],
          },
        ],
      },
      {
        checkpointId: 'arrival',
        durationMs: animationTiming.settleDurationMs,
        id: createSemanticId(nextRoom, 'phase-arrival'),
        presentedRoom: arrivalRoom,
        steps: createArrivalSteps(previousRoom, nextRoom, nextActor.identity.id, [
          { primitive: 'bulge', targets: [animationTargets.playerNobles(nextActor.identity.id)] },
          { primitive: 'flip-number', targets: [animationTargets.playerScore(nextActor.identity.id)] },
        ]),
      },
      createFinalPhase(nextRoom),
    ],
  };
};

const createNobleSkipPlan = (
  previousRoom: PublicRoomState,
  nextRoom: PublicRoomState,
): AnimationPlan => ({
  checkpoints: [
    { id: 'departure', room: previousRoom },
    { id: 'final', room: nextRoom },
  ],
  finalRoom: nextRoom,
  id: createSemanticId(nextRoom, 'noble-skip'),
  kind: 'noble-skip',
  phases: [
    {
      checkpointId: 'departure',
      durationMs: animationTiming.turnHandoffGapMs,
      id: createSemanticId(nextRoom, 'phase-wait'),
      presentedRoom: previousRoom,
      steps: [{ primitive: 'wait' }],
    },
  ],
});

export const deriveAnimationPlan = (
  previousRoom: PublicRoomState | null,
  nextRoom: PublicRoomState | null,
): AnimationPlan | null => {
  if (!previousRoom || !nextRoom) {
    return null;
  }

  if (previousRoom.id !== nextRoom.id || previousRoom.stateVersion === nextRoom.stateVersion) {
    return null;
  }

  const kind = deriveTransitionKind(previousRoom, nextRoom);

  switch (kind) {
    case 'chip-take':
      return createChipTakePlan(previousRoom, nextRoom);
    case 'discard':
      return createDiscardPlan(previousRoom, nextRoom);
    case 'reserve-visible':
      return createReserveVisiblePlan(previousRoom, nextRoom);
    case 'blind-reserve':
      return createBlindReservePlan(previousRoom, nextRoom);
    case 'market-purchase':
      return createMarketPurchasePlan(previousRoom, nextRoom);
    case 'purchase-reserved':
      return createPurchaseReservedPlan(previousRoom, nextRoom);
    case 'noble-claim':
      return createNobleClaimPlan(previousRoom, nextRoom);
    case 'noble-skip':
      return createNobleSkipPlan(previousRoom, nextRoom);
    case 'no-op':
    case 'unknown':
      return null;
  }
};
