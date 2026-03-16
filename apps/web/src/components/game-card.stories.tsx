import { DEVELOPMENT_CARDS, NOBLES } from '@splendor/game-engine';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DeckCard, GemPip, NobleTile, SplendorCard } from './game-card.js';

const meta = {
  title: 'Game/Card Primitives',
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-stone-950 p-4 text-stone-100">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const DevelopmentCard: Story = {
  render: () => <SplendorCard card={DEVELOPMENT_CARDS[8]!} />,
};

export const Noble: Story = {
  render: () => <NobleTile noble={NOBLES[0]!} />,
};

export const DeckBack: Story = {
  render: () => <DeckCard remainingCount={30} tier={2} />,
};

export const GemRow: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <GemPip color="white" count={4} />
      <GemPip color="blue" count={4} />
      <GemPip color="green" count={4} />
      <GemPip color="red" count={4} />
      <GemPip color="black" count={4} />
      <GemPip color="gold" count={5} />
    </div>
  ),
};
