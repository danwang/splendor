import {
  DEVELOPMENT_CARDS,
  NOBLES,
  setupGameWithSeed,
  type GameState,
} from '@splendor/game-engine';

import { type RoomSceneProps } from './room-scene.js';
import { type PublicRoomState } from '../lib/types.js';

export const devProfiles = [
  { id: 'dev-alice', displayName: 'Alice Quartz' },
  { id: 'dev-bob', displayName: 'Bob Onyx' },
  { id: 'dev-carmen', displayName: 'Carmen Topaz' },
  { id: 'dev-diego', displayName: 'Diego Jade' },
] as const;

const players = [
  { id: 'dev-alice', displayName: 'Alice Quartz' },
  { id: 'dev-bob', displayName: 'Bob Onyx' },
  { id: 'dev-carmen', displayName: 'Carmen Topaz' },
] as const;

const baseGame = setupGameWithSeed(
  players,
  {
    seatCount: 3,
    targetScore: 15,
  },
  'storybook-seed',
);

export const createRoom = (
  game: GameState | null,
  overrides: Partial<PublicRoomState> = {},
): PublicRoomState => ({
  id: 'storybook-room',
  config: {
    seatCount: 3,
    targetScore: 15,
  },
  hostUserId: 'dev-alice',
  participants: players.map((player) => ({
    userId: player.id,
    displayName: player.displayName,
  })),
  stateVersion: 1,
  game,
  status: game ? game.status : 'waiting',
  ...overrides,
});

export const withDiscardPhase = (): GameState => {
  const player = baseGame.players[0]!;

  return {
    ...baseGame,
    players: [
      {
        ...player,
        tokens: {
          ...player.tokens,
          white: 3,
          blue: 3,
          green: 2,
          red: 2,
          black: 1,
          gold: 1,
        },
      },
      baseGame.players[1]!,
      baseGame.players[2]!,
    ],
    turn: {
      kind: 'discard',
      activePlayerIndex: 0,
      round: 1,
      requiredCount: 2,
    },
  };
};

export const withNobleChoice = (): GameState => {
  const player = baseGame.players[0]!;
  const purchasedCards = [
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'white')!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'white' && card.points > 0)!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'blue')!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'blue' && card.points > 0)!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'green')!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'green' && card.points > 0)!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'red')!,
    DEVELOPMENT_CARDS.find((card) => card.bonus === 'black')!,
  ];

  return {
    ...baseGame,
    players: [
      {
        ...player,
        purchasedCards,
      },
      baseGame.players[1]!,
      baseGame.players[2]!,
    ],
    nobles: NOBLES.slice(0, 3),
    turn: {
      kind: 'noble',
      activePlayerIndex: 0,
      round: 2,
      eligibleNobleIds: [NOBLES[0]!.id, NOBLES[1]!.id],
    },
  };
};

export const withReservedPressure = (): GameState => {
  const alice = baseGame.players[0]!;
  const bob = baseGame.players[1]!;
  const carmen = baseGame.players[2]!;

  return {
    ...baseGame,
    players: [
      {
        ...alice,
        purchasedCards: DEVELOPMENT_CARDS.slice(0, 6),
        reservedCards: [DEVELOPMENT_CARDS[10]!, DEVELOPMENT_CARDS[24]!],
        tokens: {
          ...alice.tokens,
          white: 2,
          blue: 2,
          green: 2,
          red: 1,
          black: 1,
          gold: 1,
        },
        nobles: [NOBLES[0]!],
      },
      {
        ...bob,
        purchasedCards: DEVELOPMENT_CARDS.slice(12, 17),
        reservedCards: [DEVELOPMENT_CARDS[61]!],
        tokens: {
          ...bob.tokens,
          white: 1,
          blue: 3,
          green: 1,
          red: 2,
          black: 1,
          gold: 0,
        },
      },
      {
        ...carmen,
        purchasedCards: DEVELOPMENT_CARDS.slice(25, 30),
        reservedCards: [DEVELOPMENT_CARDS[34]!, DEVELOPMENT_CARDS[44]!],
        tokens: {
          ...carmen.tokens,
          white: 0,
          blue: 1,
          green: 3,
          red: 1,
          black: 2,
          gold: 1,
        },
      },
    ],
    nobles: [NOBLES[1]!, NOBLES[2]!, NOBLES[3]!],
  };
};

export const withFinishedGame = (): GameState => {
  const alice = baseGame.players[0]!;
  const bob = baseGame.players[1]!;
  const carmen = baseGame.players[2]!;

  return {
    ...baseGame,
    status: 'finished',
    result: {
      winners: ['dev-alice'],
      winningScore: 16,
      tiedOnCards: false,
    },
    players: [
      {
        ...alice,
        purchasedCards: DEVELOPMENT_CARDS.slice(0, 6),
        nobles: [NOBLES[0]!],
      },
      {
        ...bob,
        purchasedCards: DEVELOPMENT_CARDS.slice(6, 11),
      },
      {
        ...carmen,
        purchasedCards: DEVELOPMENT_CARDS.slice(11, 15),
      },
    ],
  };
};

export const withNoGoldReserve = (): GameState => {
  const state = withReservedPressure();

  return {
    ...state,
    bank: {
      ...state.bank,
      gold: 0,
    },
  };
};

export const baseArgs: RoomSceneProps = {
  currentUserId: 'dev-alice',
  devProfiles,
  errorMessage: null,
  isDevBypassEnabled: true,
  isWorking: false,
  onJoinRoom: () => undefined,
  onLogout: () => undefined,
  onSelectDevProfile: () => undefined,
  onStartGame: () => undefined,
  onSubmitMove: () => undefined,
  room: createRoom(baseGame),
  roomId: 'storybook-room',
  user: {
    id: 'dev-alice',
    displayName: 'Alice Quartz',
  },
};
