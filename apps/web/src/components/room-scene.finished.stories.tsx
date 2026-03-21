import type { Meta, StoryObj } from '@storybook/react-vite';

import { RoomScene } from './room-scene.js';
import { baseArgs, createRoom, withFinishedGame } from './room-scene.story-helpers.js';

const finishedGame = withFinishedGame();

const meta = {
  title: 'Game/Finished',
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

export const ResultsScreen: Story = {
  args: {
    initialResultsVisible: true,
    room: createRoom(finishedGame, {
      stateVersion: 20,
      status: 'finished',
    }),
  },
};

export const BoardView: Story = {
  args: {
    initialResultsVisible: false,
    room: createRoom(finishedGame, {
      stateVersion: 21,
      status: 'finished',
    }),
  },
};
