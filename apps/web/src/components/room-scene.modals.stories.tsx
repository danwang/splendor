import type { Meta, StoryObj } from '@storybook/react-vite';

import { RoomScene } from './room-scene.js';
import { baseArgs, createRoom, withNoGoldReserve, withReservedPressure } from './room-scene.story-helpers.js';

const reservedPressureGame = withReservedPressure();

const meta = {
  title: 'Game/RoomScene/Modals',
  component: RoomScene,
  args: baseArgs,
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

export const PlayerSelf: Story = {
  args: {
    initialSelection: {
      type: 'player',
      playerId: 'dev-alice',
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 9,
      status: 'in_progress',
    }),
  },
};

export const PlayerOpponent: Story = {
  args: {
    currentUserId: 'dev-alice',
    initialSelection: {
      type: 'player',
      playerId: 'dev-bob',
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 14,
      status: 'in_progress',
    }),
  },
};

export const Menu: Story = {
  args: {
    initialSelection: {
      type: 'menu',
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 15,
      status: 'in_progress',
    }),
  },
};

export const MarketCard: Story = {
  args: {
    initialSelection: {
      type: 'market-card',
      cardId: reservedPressureGame.market.tier2[0]!.id,
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 16,
      status: 'in_progress',
    }),
  },
};

export const ReservedCard: Story = {
  args: {
    initialSelection: {
      type: 'reserved-card',
      cardId: reservedPressureGame.players[0]!.reservedCards[0]!.id,
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 17,
      status: 'in_progress',
    }),
  },
};

export const BlindReserve: Story = {
  args: {
    initialSelection: {
      type: 'deck',
      tier: 2,
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 18,
      status: 'in_progress',
    }),
  },
};

export const BlindReserveNoGold: Story = {
  args: {
    initialSelection: {
      type: 'deck',
      tier: 2,
    },
    room: createRoom(withNoGoldReserve(), {
      stateVersion: 19,
      status: 'in_progress',
    }),
  },
};

export const TakeGems: Story = {
  args: {
    initialSelection: {
      type: 'bank',
    },
    room: createRoom(reservedPressureGame, {
      stateVersion: 20,
      status: 'in_progress',
    }),
  },
};
