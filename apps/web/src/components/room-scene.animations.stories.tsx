import {
  DEVELOPMENT_CARDS,
  NOBLES,
  reduceGame,
  setupGameWithSeed,
  type GameState,
  type PlayerState,
  type Move,
} from '@splendor/game-engine';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';

import { RoomScene } from './room-scene.js';
import { baseArgs, createRoom } from './room-scene.story-helpers.js';
import { type PublicRoomState } from '../lib/types.js';

const repeatingPlayers = [
  { id: 'dev-alice', displayName: 'Alice Quartz' },
  { id: 'dev-bob', displayName: 'Bob Onyx' },
  { id: 'dev-carmen', displayName: 'Carmen Topaz' },
] as const;

const createSeededGame = (): GameState =>
  setupGameWithSeed(
    repeatingPlayers,
    {
      seatCount: 3,
      targetScore: 15,
    },
    'storybook-animation-seed',
  );

const assertReduced = (state: GameState, move: Move): GameState => {
  const result = reduceGame(state, move);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.state;
};

const replacePlayer = (
  state: GameState,
  index: number,
  player: PlayerState,
): GameState => ({
  ...state,
  players: state.players.map((entry, entryIndex) => (entryIndex === index ? player : entry)),
});

const createLogSequenceRooms = (): readonly PublicRoomState[] => {
  const waitingBase = createRoom(null, {
    connectedUserIds: ['dev-alice', 'dev-bob'],
    participants: repeatingPlayers.slice(0, 2).map((player) => ({
      userId: player.id,
      displayName: player.displayName,
    })),
    stateVersion: 200,
    status: 'waiting',
  });

  const waitingJoined = {
    ...waitingBase,
    connectedUserIds: repeatingPlayers.map((player) => player.id),
    participants: repeatingPlayers.map((player) => ({
      userId: player.id,
      displayName: player.displayName,
    })),
    stateVersion: 201,
  } satisfies PublicRoomState;

  const waitingLeft = {
    ...waitingJoined,
    connectedUserIds: ['dev-alice', 'dev-carmen'],
    participants: [repeatingPlayers[0]!, repeatingPlayers[2]!].map((player) => ({
      userId: player.id,
      displayName: player.displayName,
    })),
    stateVersion: 202,
  } satisfies PublicRoomState;

  const startedGameRoom = createRoom(createSeededGame(), {
    connectedUserIds: repeatingPlayers.map((player) => player.id),
    participants: repeatingPlayers.map((player) => ({
      userId: player.id,
      displayName: player.displayName,
    })),
    stateVersion: 203,
    status: 'in_progress',
  });

  const tokenTakeRoom = createRoom(
    assertReduced(startedGameRoom.game!, {
      type: 'take-distinct',
      colors: ['white', 'blue', 'green'],
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 204,
      status: 'in_progress',
    },
  );

  const reserveMarketRoom = createRoom(
    assertReduced(tokenTakeRoom.game!, {
      type: 'reserve-visible',
      cardId: tokenTakeRoom.game!.market.tier1[0]!.id,
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 205,
      status: 'in_progress',
    },
  );

  const blindReserveRoom = createRoom(
    assertReduced(reserveMarketRoom.game!, {
      type: 'reserve-deck',
      tier: 2,
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 206,
      status: 'in_progress',
    },
  );

  const marketTarget = blindReserveRoom.game!.market.tier1[1]!;
  const buyMarketReady = replacePlayer(blindReserveRoom.game!, 0, {
    ...blindReserveRoom.game!.players[0]!,
    tokens: {
      white: marketTarget.cost.white,
      blue: marketTarget.cost.blue,
      green: marketTarget.cost.green,
      red: marketTarget.cost.red,
      black: marketTarget.cost.black,
      gold: 0,
    },
  });
  const buyMarketReadyTurn = {
    ...buyMarketReady,
    turn: {
      kind: 'main-action' as const,
      activePlayerIndex: 0,
      round: blindReserveRoom.game!.turn.round + 1,
    },
  };
  const buyMarketRoom = createRoom(
    assertReduced(buyMarketReadyTurn, {
      type: 'purchase-visible',
      cardId: marketTarget.id,
      payment: {
        tokens: marketTarget.cost,
        gold: 0,
      },
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 207,
      status: 'in_progress',
    },
  );

  const reservedPurchaseCard = DEVELOPMENT_CARDS[55]!;
  const buyReservedReady = replacePlayer(buyMarketRoom.game!, 0, {
    ...buyMarketRoom.game!.players[0]!,
    reservedCards: [reservedPurchaseCard],
    tokens: {
      white: reservedPurchaseCard.cost.white,
      blue: reservedPurchaseCard.cost.blue,
      green: reservedPurchaseCard.cost.green,
      red: reservedPurchaseCard.cost.red,
      black: reservedPurchaseCard.cost.black,
      gold: 0,
    },
  });
  const buyReservedReadyTurn = {
    ...buyReservedReady,
    turn: {
      kind: 'main-action' as const,
      activePlayerIndex: 0,
      round: buyMarketRoom.game!.turn.round + 1,
    },
  };
  const buyReservedRoom = createRoom(
    assertReduced(buyReservedReadyTurn, {
      type: 'purchase-reserved',
      cardId: reservedPurchaseCard.id,
      payment: {
        tokens: reservedPurchaseCard.cost,
        gold: 0,
      },
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 208,
      status: 'in_progress',
    },
  );

  const genericBoughtCard = DEVELOPMENT_CARDS[80]!;
  const genericBuyRoom = createRoom(
    {
      ...buyReservedRoom.game!,
      players: buyReservedRoom.game!.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              purchasedCards: [...player.purchasedCards, genericBoughtCard],
            }
          : player,
      ),
      turn: {
        kind: 'main-action' as const,
        activePlayerIndex: 2,
        round: buyReservedRoom.game!.turn.round + 1,
      },
    },
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 209,
      status: 'in_progress',
    },
  );

  const discardReadyRoom = createRoom(
    {
      ...genericBuyRoom.game!,
      players: genericBuyRoom.game!.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              tokens: {
                white: 3,
                blue: 3,
                green: 2,
                red: 2,
                black: 1,
                gold: 1,
              },
            }
          : player,
      ),
      turn: {
        kind: 'discard' as const,
        activePlayerIndex: 0,
        round: genericBuyRoom.game!.turn.round + 1,
        requiredCount: 2,
      },
    },
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 210,
      status: 'in_progress',
    },
  );

  const discardResolvedRoom = createRoom(
    assertReduced(discardReadyRoom.game!, {
      type: 'discard-tokens',
      tokens: ['red', 'black'],
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 211,
      status: 'in_progress',
    },
  );

  const nobleChoiceRoom = createRoom(
    {
      ...discardResolvedRoom.game!,
      turn: {
        kind: 'noble' as const,
        activePlayerIndex: 0,
        round: discardResolvedRoom.game!.turn.round + 1,
        eligibleNobleIds: ['noble-1', 'noble-2'],
      },
      nobles: NOBLES.slice(0, 3),
    },
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 212,
      status: 'in_progress',
    },
  );

  const nobleClaimRoom = createRoom(
    assertReduced(nobleChoiceRoom.game!, {
      type: 'claim-noble',
      nobleId: 'noble-1',
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 213,
      status: 'in_progress',
    },
  );

  const nobleSkipChoiceRoom = createRoom(
    {
      ...nobleClaimRoom.game!,
      turn: {
        kind: 'noble' as const,
        activePlayerIndex: 1,
        round: nobleClaimRoom.game!.turn.round + 1,
        eligibleNobleIds: ['noble-2'],
      },
    },
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 214,
      status: 'in_progress',
    },
  );

  const nobleSkipRoom = createRoom(
    assertReduced(nobleSkipChoiceRoom.game!, {
      type: 'skip-noble',
    }),
    {
      connectedUserIds: startedGameRoom.connectedUserIds,
      participants: startedGameRoom.participants,
      stateVersion: 215,
      status: 'in_progress',
    },
  );

  return [
    waitingBase,
    waitingJoined,
    waitingLeft,
    startedGameRoom,
    tokenTakeRoom,
    reserveMarketRoom,
    blindReserveRoom,
    buyMarketRoom,
    buyReservedRoom,
    genericBuyRoom,
    discardReadyRoom,
    discardResolvedRoom,
    nobleChoiceRoom,
    nobleClaimRoom,
    nobleSkipChoiceRoom,
    nobleSkipRoom,
  ] as const;
};

const createTokenTakeRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = createSeededGame();
  const toGame = assertReduced(fromGame, {
    type: 'take-distinct',
    colors: ['white', 'blue', 'green'],
  });

  return [
    createRoom(fromGame, { stateVersion: 100, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 101, status: 'in_progress' }),
  ] as const;
};

const createDoubleChipTakeRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = createSeededGame();
  const toGame = assertReduced(fromGame, {
    type: 'take-pair',
    color: 'white',
  });

  return [
    createRoom(fromGame, { stateVersion: 102, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 103, status: 'in_progress' }),
  ] as const;
};

const createReserveVisibleRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = createSeededGame();
  const targetCard = fromGame.market.tier1[0]!;
  const toGame = assertReduced(fromGame, {
    type: 'reserve-visible',
    cardId: targetCard.id,
  });

  return [
    createRoom(fromGame, { stateVersion: 104, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 105, status: 'in_progress' }),
  ] as const;
};

const createBlindReserveRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = createSeededGame();
  const toGame = assertReduced(fromGame, {
    type: 'reserve-deck',
    tier: 2,
  });

  return [
    createRoom(fromGame, { stateVersion: 106, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 107, status: 'in_progress' }),
  ] as const;
};

const createMarketPurchaseRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const seededGame = createSeededGame();
  const targetCard = seededGame.market.tier1[1]!;
  const fromGame: GameState = {
    ...seededGame,
    players: [
      {
        ...seededGame.players[0]!,
        tokens: {
          white: targetCard.cost.white,
          blue: targetCard.cost.blue,
          green: targetCard.cost.green,
          red: targetCard.cost.red,
          black: targetCard.cost.black,
          gold: 0,
        },
      },
      seededGame.players[1]!,
      seededGame.players[2]!,
    ],
  };
  const toGame = assertReduced(fromGame, {
    type: 'purchase-visible',
    cardId: targetCard.id,
    payment: {
      tokens: targetCard.cost,
      gold: 0,
    },
  });

  return [
    createRoom(fromGame, { stateVersion: 110, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 111, status: 'in_progress' }),
  ] as const;
};

const createPurchaseReservedRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = createSeededGame();
  const reservedCard = DEVELOPMENT_CARDS[55]!;
  const stagedGame: GameState = {
    ...fromGame,
    players: [
      {
        ...fromGame.players[0]!,
        reservedCards: [reservedCard],
        tokens: {
          white: reservedCard.cost.white,
          blue: reservedCard.cost.blue,
          green: reservedCard.cost.green,
          red: reservedCard.cost.red,
          black: reservedCard.cost.black,
          gold: 0,
        },
      },
      fromGame.players[1]!,
      fromGame.players[2]!,
    ],
  };
  const toGame = assertReduced(stagedGame, {
    type: 'purchase-reserved',
    cardId: reservedCard.id,
    payment: {
      tokens: reservedCard.cost,
      gold: 0,
    },
  });

  return [
    createRoom(stagedGame, { stateVersion: 108, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 109, status: 'in_progress' }),
  ] as const;
};

const createNobleClaimRooms = (): readonly [PublicRoomState, PublicRoomState] => {
  const fromGame = {
    ...createSeededGame(),
    turn: {
      kind: 'noble' as const,
      activePlayerIndex: 0,
      round: 2,
      eligibleNobleIds: ['noble-1', 'noble-2'],
    },
  };
  const toGame = assertReduced(fromGame, {
    type: 'claim-noble',
    nobleId: 'noble-1',
  });

  return [
    createRoom(fromGame, { stateVersion: 120, status: 'in_progress' }),
    createRoom(toGame, { stateVersion: 121, status: 'in_progress' }),
  ] as const;
};

const withStateVersion = (room: PublicRoomState, stateVersion: number): PublicRoomState => ({
  ...room,
  stateVersion,
});

const RepeatingTransition = ({
  currentUserId = baseArgs.currentUserId,
  initialActivePanel = 'board',
  rooms,
}: {
  readonly currentUserId?: string;
  readonly initialActivePanel?: 'board' | 'nobles' | 'log';
  readonly rooms: readonly [PublicRoomState, PublicRoomState];
}) => {
  const [cycle, setCycle] = useState(0);
  const [room, setRoom] = useState(() => withStateVersion(rooms[0], 1000));

  useEffect(() => {
    setRoom(withStateVersion(rooms[0], 1000 + cycle * 2));
    const animateTimeoutId = window.setTimeout(() => {
      setRoom(withStateVersion(rooms[1], 1001 + cycle * 2));
    }, 820);
    const repeatTimeoutId = window.setTimeout(() => {
      setCycle((current) => current + 1);
    }, 3_850);

    return () => {
      window.clearTimeout(animateTimeoutId);
      window.clearTimeout(repeatTimeoutId);
    };
  }, [cycle, rooms]);

  return (
    <RoomScene
      {...baseArgs}
      currentUserId={currentUserId}
      initialActivePanel={initialActivePanel}
      key={cycle}
      room={room}
    />
  );
};

const StaticRoomSequence = ({
  initialActivePanel = 'log',
  rooms,
}: {
  readonly initialActivePanel?: 'board' | 'nobles' | 'log';
  readonly rooms: readonly PublicRoomState[];
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= rooms.length - 1) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, rooms.length - 1));
    }, index === 0 ? 120 : 70);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [index, rooms.length]);

  return (
    <RoomScene
      {...baseArgs}
      initialActivePanel={initialActivePanel}
      room={withStateVersion(rooms[index]!, 4000 + index)}
    />
  );
};

const meta = {
  title: 'Game/RoomScene/Animations',
  component: RoomScene,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md bg-stone-950 sm:max-w-none">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomScene>;

export default meta;

type Story = StoryObj<typeof meta>;

const ChipTakePreview = () => <RepeatingTransition rooms={createTokenTakeRooms()} />;
const DoubleChipTakePreview = () => <RepeatingTransition rooms={createDoubleChipTakeRooms()} />;
const ReserveVisiblePreview = () => <RepeatingTransition rooms={createReserveVisibleRooms()} />;
const BlindReservePreview = () => <RepeatingTransition rooms={createBlindReserveRooms()} />;
const PurchaseReservedPreview = () => <RepeatingTransition rooms={createPurchaseReservedRooms()} />;

const MarketPurchasePreview = () => <RepeatingTransition rooms={createMarketPurchaseRooms()} />;

const NobleClaimPreview = () => (
  <RepeatingTransition currentUserId="dev-bob" rooms={createNobleClaimRooms()} />
);

const LogCatalogPreview = () => (
  <StaticRoomSequence initialActivePanel="log" rooms={createLogSequenceRooms()} />
);

export const ChipTake: Story = {
  args: baseArgs,
  render: () => <ChipTakePreview />,
};

export const DoubleChipTake: Story = {
  args: baseArgs,
  render: () => <DoubleChipTakePreview />,
};

export const ReserveVisible: Story = {
  args: baseArgs,
  render: () => <ReserveVisiblePreview />,
};

export const BlindReserve: Story = {
  args: baseArgs,
  render: () => <BlindReservePreview />,
};

export const MarketPurchase: Story = {
  args: baseArgs,
  render: () => <MarketPurchasePreview />,
};

export const PurchaseReserved: Story = {
  args: baseArgs,
  render: () => <PurchaseReservedPreview />,
};

export const NobleClaim: Story = {
  args: baseArgs,
  render: () => <NobleClaimPreview />,
};

export const LogCatalog: Story = {
  args: baseArgs,
  render: () => <LogCatalogPreview />,
};
