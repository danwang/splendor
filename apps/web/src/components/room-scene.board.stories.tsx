import type { Meta, StoryObj } from '@storybook/react-vite';

import { RoomScene } from './room-scene.js';
import { baseArgs, createRoom, withDiscardPhase, withNobleChoice, withReservedPressure } from './room-scene.story-helpers.js';

const meta = {
  title: 'Game/RoomScene/Board',
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

export const LobbyWaiting: Story = {
  args: {
    room: createRoom(null, {
      stateVersion: 0,
      status: 'waiting',
    }),
  },
};

export const OpeningTurn: Story = {};

export const DenseMidgame: Story = {
  args: {
    room: createRoom(withReservedPressure(), {
      stateVersion: 8,
      status: 'in_progress',
    }),
  },
};

export const WaitingForOpponent: Story = {
  args: {
    currentUserId: 'dev-bob',
  },
};

export const DiscardPhase: Story = {
  args: {
    room: createRoom(withDiscardPhase(), {
      stateVersion: 11,
      status: 'in_progress',
    }),
  },
};

export const NobleChoice: Story = {
  args: {
    room: createRoom(withNobleChoice(), {
      stateVersion: 13,
      status: 'in_progress',
    }),
  },
};
