import { describe, expect, it } from 'vitest';

import { createAnimationRunnerFrame, advanceAnimationRunner, startAnimationPlan } from './animation-runner.js';
import { type AnimationPlan } from './animation-types.js';
import { type PublicRoomState } from './types.js';

const createRoom = (stateVersion: number, activePlayerIndex: number): PublicRoomState => ({
  id: 'test-room',
  config: {
    seatCount: 2,
    targetScore: 15,
  },
  connectedUserIds: ['p1', 'p2'],
  hostUserId: 'p1',
  participants: [
    { userId: 'p1', displayName: 'Ada' },
    { userId: 'p2', displayName: 'Grace' },
  ],
  stateVersion,
  game: {
    config: {
      seatCount: 2,
      targetScore: 15,
    },
    bank: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
    decks: { tier1: [], tier2: [], tier3: [] },
    market: { tier1: [], tier2: [], tier3: [] },
    nobles: [],
    players: [
      {
        identity: { id: 'p1', displayName: 'Ada' },
        nobles: [],
        purchasedCards: [],
        reservedCards: [],
        tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      },
      {
        identity: { id: 'p2', displayName: 'Grace' },
        nobles: [],
        purchasedCards: [],
        reservedCards: [],
        tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      },
    ],
    status: 'in_progress',
    turn: {
      kind: 'main-action',
      activePlayerIndex,
      round: 1,
    },
  },
  status: 'in_progress',
});

const resolveTargetRect = () => ({
  height: 40,
  left: 0,
  top: 0,
  width: 40,
});

describe('animation runner', () => {
  it('advances through checkpoints and only hands off on the final phase', () => {
    const departureRoom = createRoom(1, 0);
    const arrivalRoom = createRoom(2, 0);
    const finalRoom = createRoom(3, 1);
    const plan: AnimationPlan = {
      checkpoints: [
        { id: 'departure', room: departureRoom },
        { id: 'arrival', room: arrivalRoom },
        { id: 'final', room: finalRoom },
      ],
      finalRoom,
      id: 'test-plan',
      kind: 'chip-take',
      phases: [
        {
          checkpointId: 'departure',
          durationMs: 100,
          id: 'phase-0',
          presentedRoom: departureRoom,
          steps: [{ primitive: 'bulge', targets: ['bank:white'] }],
        },
        {
          checkpointId: 'arrival',
          durationMs: 100,
          id: 'phase-1',
          presentedRoom: arrivalRoom,
          steps: [{ primitive: 'highlight-row', targets: ['player:p1:row'] }],
        },
        {
          checkpointId: 'final',
          durationMs: 100,
          id: 'phase-2',
          presentedRoom: finalRoom,
          steps: [],
        },
      ],
    };

    const initial = createAnimationRunnerFrame(departureRoom);
    const started = startAnimationPlan(departureRoom, plan, resolveTargetRect);

    expect(initial.presentedRoom).toBe(departureRoom);
    expect(started.phaseIndex).toBe(0);
    expect(started.presentedRoom).toBe(departureRoom);
    expect(started.activeTargets.bulge.has('bank:white')).toBe(true);

    const arrival = advanceAnimationRunner(started, resolveTargetRect);

    expect(arrival.phaseIndex).toBe(1);
    expect(arrival.presentedRoom).toBe(arrivalRoom);
    expect(arrival.activeTargets.highlightRow.has('player:p1:row')).toBe(true);

    const handoff = advanceAnimationRunner(arrival, resolveTargetRect);

    expect(handoff.phaseIndex).toBe(2);
    expect(handoff.presentedRoom).toBe(finalRoom);

    const finished = advanceAnimationRunner(handoff, resolveTargetRect);

    expect(finished.isAnimating).toBe(false);
    expect(finished.currentPlan).toBeNull();
    expect(finished.presentedRoom).toBe(finalRoom);
  });
});
