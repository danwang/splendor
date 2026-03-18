import {
  NOBLES,
  reduceGame,
  setupGameWithSeed,
  type GameState,
  type Move,
} from '@splendor/game-engine';
import { describe, expect, it } from 'vitest';

import { deriveAnimationPlan } from './animation-plan.js';
import { animationTargets } from './animation-targets.js';
import { type PublicRoomState } from './types.js';

const players = [
  { id: 'p1', displayName: 'Ada' },
  { id: 'p2', displayName: 'Grace' },
] as const;

const createRoom = (game: GameState, stateVersion: number): PublicRoomState => ({
  id: 'test-room',
  config: {
    seatCount: 2,
    targetScore: 15,
  },
  connectedUserIds: ['p1', 'p2'],
  hostUserId: 'p1',
  participants: players.map((player) => ({
    userId: player.id,
    displayName: player.displayName,
  })),
  stateVersion,
  game,
  status: game.status,
});

const createGame = (): GameState =>
  setupGameWithSeed(
    players,
    {
      seatCount: 2,
      targetScore: 15,
    },
    'animation-plan-seed',
  );

const reduceOk = (state: GameState, move: Move): GameState => {
  const result = reduceGame(state, move);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.state;
};

describe('deriveAnimationPlan', () => {
  it('returns null for a no-op room update', () => {
    const game = createGame();
    const room = createRoom(game, 1);

    expect(deriveAnimationPlan(room, room)).toBeNull();
  });

  it('derives chip take phases with departure, arrival, and final handoff', () => {
    const previousGame = createGame();
    const nextGame = reduceOk(previousGame, {
      type: 'take-distinct',
      colors: ['white', 'blue', 'green'],
    });

    const previousRoom = createRoom(previousGame, 1);
    const nextRoom = createRoom(nextGame, 2);
    const plan = deriveAnimationPlan(previousRoom, nextRoom);

    expect(plan?.kind).toBe('chip-take');
    expect(plan?.phases.map((phase) => phase.checkpointId)).toEqual(['departure', 'arrival', 'final']);
    expect(plan?.phases[0]?.steps.some((step) => step.primitive === 'flight-chip')).toBe(true);
    expect(plan?.phases[0]?.steps.some((step) => step.primitive === 'bulge')).toBe(true);
    expect(plan?.phases[1]?.steps.some((step) => step.primitive === 'highlight-row')).toBe(true);
    expect(plan?.phases[1]?.presentedRoom.game?.turn).toEqual(previousGame.turn);
    expect(plan?.finalRoom.game?.turn).toEqual(nextGame.turn);
  });

  it('derives market purchase with payment chips and card flight in parallel', () => {
    const baseGame = createGame();
    const targetCard = baseGame.market.tier1[0]!;
    const readyGame: GameState = {
      ...baseGame,
      players: [
        {
          ...baseGame.players[0]!,
          tokens: {
            white: targetCard.cost.white,
            blue: targetCard.cost.blue,
            green: targetCard.cost.green,
            red: targetCard.cost.red,
            black: targetCard.cost.black,
            gold: 0,
          },
        },
        baseGame.players[1]!,
      ],
    };
    const nextGame = reduceOk(readyGame, {
      type: 'purchase-visible',
      cardId: targetCard.id,
      payment: {
        tokens: targetCard.cost,
        gold: 0,
      },
    });

    const plan = deriveAnimationPlan(createRoom(readyGame, 1), createRoom(nextGame, 2));

    expect(plan?.kind).toBe('market-purchase');
    const departureSteps = plan?.phases[0]?.steps ?? [];
    expect(departureSteps.some((step) => step.primitive === 'flight-chip')).toBe(true);
    expect(departureSteps.some((step) => step.primitive === 'flight-card')).toBe(true);
    expect(
      departureSteps.some(
        (step) =>
          step.primitive === 'fade-placeholder' &&
          step.targets.includes(animationTargets.marketCard(targetCard.id)),
      ),
    ).toBe(true);
  });

  it('keeps blind reserve hidden during the flight', () => {
    const previousGame = createGame();
    const nextGame = reduceOk(previousGame, {
      type: 'reserve-deck',
      tier: 2,
    });
    const plan = deriveAnimationPlan(createRoom(previousGame, 1), createRoom(nextGame, 2));

    expect(plan?.kind).toBe('blind-reserve');
    const departureSteps = plan?.phases[0]?.steps ?? [];
    const cardFlight = departureSteps.find((step) => step.primitive === 'flight-card');

    expect(cardFlight && cardFlight.primitive === 'flight-card').toBe(true);
    if (cardFlight?.primitive !== 'flight-card') {
      throw new Error('Expected blind reserve card flight.');
    }
    expect(cardFlight.flights[0]?.kind).toBe('reserve-deck');
    expect(plan?.phases.flatMap((phase) => phase.steps).some((step) => step.primitive === 'flip-card')).toBe(
      false,
    );
  });

  it('derives purchase reserved as expand, flip, then travel', () => {
    const baseGame = createGame();
    const reserveCard = baseGame.market.tier1[0]!;
    const reservedGame = reduceOk(baseGame, {
      type: 'reserve-visible',
      cardId: reserveCard.id,
    });
    const readyGame: GameState = {
      ...reservedGame,
      players: [
        {
          ...reservedGame.players[0]!,
          tokens: {
            white: reserveCard.cost.white,
            blue: reserveCard.cost.blue,
            green: reserveCard.cost.green,
            red: reserveCard.cost.red,
            black: reserveCard.cost.black,
            gold: 0,
          },
        },
        reservedGame.players[1]!,
      ],
      turn: {
        kind: 'main-action',
        activePlayerIndex: 0,
        round: reservedGame.turn.round + 1,
      },
    };
    const nextGame = reduceOk(readyGame, {
      type: 'purchase-reserved',
      cardId: reserveCard.id,
      payment: {
        tokens: reserveCard.cost,
        gold: 0,
      },
    });
    const plan = deriveAnimationPlan(createRoom(readyGame, 1), createRoom(nextGame, 2));

    expect(plan?.kind).toBe('purchase-reserved');
    const departureSteps = plan?.phases[0]?.steps ?? [];
    expect(
      departureSteps.some(
        (step) =>
          step.primitive === 'expand-card' &&
          step.targets.includes(animationTargets.playerReserved('p1')),
      ),
    ).toBe(true);
    expect(
      departureSteps.some(
        (step) =>
          step.primitive === 'flip-card' &&
          step.targets.includes(animationTargets.playerReserved('p1')),
      ),
    ).toBe(true);
    const reservedFlight = plan?.phases
      .flatMap((phase) => phase.steps)
      .find((step) => step.primitive === 'flight-card');
    expect(reservedFlight && reservedFlight.primitive === 'flight-card').toBe(true);
    if (reservedFlight?.primitive !== 'flight-card') {
      throw new Error('Expected reserved purchase flight.');
    }
    expect(reservedFlight.flights[0]?.kind).toBe('purchase-reserved');
  });

  it('derives noble claim from viewport origin and delays final handoff', () => {
    const previousGame = createGame();
    const previousRoom = createRoom(
      {
        ...previousGame,
        nobles: [NOBLES[0]!, ...previousGame.nobles.filter((noble) => noble.id !== NOBLES[0]!.id)],
        turn: {
          kind: 'noble',
          activePlayerIndex: 0,
          round: 3,
          eligibleNobleIds: [NOBLES[0]!.id],
        },
      },
      1,
    );
    const nextRoom = createRoom(
      {
        ...previousRoom.game!,
        nobles: previousRoom.game!.nobles.filter((noble) => noble.id !== NOBLES[0]!.id),
        players: [
          {
            ...previousRoom.game!.players[0]!,
            nobles: [...previousRoom.game!.players[0]!.nobles, NOBLES[0]!],
          },
          previousRoom.game!.players[1]!,
        ],
        turn: {
          kind: 'main-action',
          activePlayerIndex: 1,
          round: 4,
        },
      },
      2,
    );

    const plan = deriveAnimationPlan(previousRoom, nextRoom);

    expect(plan?.kind).toBe('noble-claim');
    const flightStep = plan?.phases[0]?.steps.find((step) => step.primitive === 'flight-card');
    expect(flightStep && flightStep.primitive === 'flight-card').toBe(true);
    if (flightStep?.primitive !== 'flight-card') {
      throw new Error('Expected noble flight.');
    }
    expect(flightStep.flights[0]?.from).toBe(animationTargets.viewportNobleOrigin());
    expect(plan?.phases[1]?.presentedRoom.game?.turn).toEqual(previousRoom.game?.turn);
    expect(plan?.finalRoom.game?.turn).toEqual(nextRoom.game?.turn);
  });
});
