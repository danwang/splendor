import { DEVELOPMENT_CARDS } from '@splendor/game-engine';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

import { DeckCard, GemPip, SplendorCard } from './game-card.js';
import { animationCssVars } from '../lib/animation-config.js';

const useLoopingActive = (): boolean => {
  const [cycle, setCycle] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);

    const activateTimeoutId = window.setTimeout(() => {
      setActive(true);
    }, 820);
    const repeatTimeoutId = window.setTimeout(() => {
      setCycle((current) => current + 1);
    }, 3_850);

    return () => {
      window.clearTimeout(activateTimeoutId);
      window.clearTimeout(repeatTimeoutId);
    };
  }, [cycle]);

  return active;
};

const PrimitiveStage = ({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) => (
  <div
    className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-stone-950 p-6 text-stone-100"
    style={animationCssVars}
  >
    <div className="w-full rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
      <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{title}</p>
      <div className="mt-5">{children}</div>
    </div>
  </div>
);

const BulgePreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Bulge">
      <div className="flex items-center justify-center">
        <span className={active ? 'receive-bulge' : ''}>
          <GemPip color="green" count={3} />
        </span>
      </div>
    </PrimitiveStage>
  );
};

const FlightChipPreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Flight chip">
      <div className="relative mx-auto h-36 w-full max-w-xs">
        <div className="absolute left-0 top-10">
          <span className={active ? 'receive-bulge' : ''}>
            <GemPip color="blue" count={4} />
          </span>
        </div>
        <div className="absolute right-0 top-10">
          <span className={active ? 'receive-bulge receive-bulge-delay' : ''}>
            <GemPip color="blue" count={2} />
          </span>
        </div>
        {active ? (
          <span
            aria-hidden="true"
            className="chip-flight absolute left-4 top-14 h-7 w-7 rounded-full bg-sky-400 shadow-[0_4px_14px_rgba(56,189,248,0.28)]"
            style={
              {
                '--chip-dx': '220px',
                '--chip-dy': '0px',
              } as CSSProperties
            }
          />
        ) : null}
      </div>
    </PrimitiveStage>
  );
};

const FlightCardPreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Flight card">
      <div className="relative mx-auto h-44 w-full max-w-xs">
        <div className="absolute left-0 top-0 w-[4.6rem] opacity-45">
          <SplendorCard card={DEVELOPMENT_CARDS[12]!} size="compact" />
        </div>
        <div className="absolute right-0 top-10 w-[3rem] rounded-[0.75rem] border border-dashed border-white/10 bg-white/[0.03] p-1">
          <DeckCard hideCount remainingCount={0} size="compact" tier={2} />
        </div>
        {active ? (
          <div
            aria-hidden="true"
            className="card-flight absolute left-0 top-0 w-[4.6rem]"
            style={
              {
                '--card-dx': '208px',
                '--card-dy': '44px',
              } as CSSProperties
            }
          >
            <SplendorCard card={DEVELOPMENT_CARDS[12]!} size="compact" />
          </div>
        ) : null}
      </div>
    </PrimitiveStage>
  );
};

const ArriveCardPreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Arrive card">
      <div className="relative mx-auto h-44 w-full max-w-xs">
        <div className="absolute left-0 top-0 w-[4.6rem]">
          <SplendorCard card={DEVELOPMENT_CARDS[24]!} size="compact" />
        </div>
        <div className="absolute right-0 top-10 w-[3.6rem]">
          <div className={active ? 'board-piece-pop' : ''}>
            <SplendorCard card={DEVELOPMENT_CARDS[24]!} size="compact" />
          </div>
        </div>
        {active ? (
          <div
            aria-hidden="true"
            className="card-flight absolute left-0 top-0 w-[4.6rem]"
            style={
              {
                '--card-dx': '194px',
                '--card-dy': '42px',
              } as CSSProperties
            }
          >
            <SplendorCard card={DEVELOPMENT_CARDS[24]!} size="compact" />
          </div>
        ) : null}
      </div>
    </PrimitiveStage>
  );
};

const ExpandCardPreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Expand card">
      <div className="relative mx-auto h-44 w-full max-w-[12rem]">
        <div className="absolute left-1/2 top-20 flex -translate-x-1/2 gap-1">
          <span className="relative h-6 w-4 rounded-[0.4rem] border border-emerald-200/35 bg-linear-to-br from-emerald-700 via-emerald-900 to-emerald-950 shadow-sm" />
        </div>
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-4 w-[4.6rem] -translate-x-1/2"
          style={{
            opacity: active ? 1 : 0.12,
            transform: `translateX(-50%) scale(${active ? 1 : 0.36})`,
            transformOrigin: 'center',
            transitionDuration: 'var(--anim-card-expand-ms)',
            transitionProperty: 'transform, opacity',
            transitionTimingFunction: 'cubic-bezier(0.16, 0.84, 0.24, 1)',
          }}
        >
          <div className="relative aspect-[5/7] w-full">
            <div className="card-flight-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
              <DeckCard hideCount remainingCount={0} size="compact" tier={1} />
            </div>
            <div className="card-flight-face absolute inset-0">
              <SplendorCard card={DEVELOPMENT_CARDS[33]!} size="compact" />
            </div>
          </div>
        </div>
      </div>
    </PrimitiveStage>
  );
};

const FlipCardPreview = () => {
  const active = useLoopingActive();

  return (
    <PrimitiveStage title="Flip card">
      <div className="flex items-center justify-center">
        <div className={`w-[4.6rem] ${active ? 'card-flight-flip' : ''}`}>
          <div className={`relative aspect-[5/7] w-full ${active ? 'card-flight-flip-inner' : ''}`}>
            <div className="card-flight-face absolute inset-0">
              <SplendorCard card={DEVELOPMENT_CARDS[44]!} size="compact" />
            </div>
            <div className="card-flight-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
              <DeckCard hideCount remainingCount={0} size="compact" tier={2} />
            </div>
          </div>
        </div>
      </div>
    </PrimitiveStage>
  );
};

const FlipNumberPreview = () => {
  const active = useLoopingActive();
  const [value, setValue] = useState(14);

  useEffect(() => {
    setValue(14);

    const timeoutId = window.setTimeout(() => {
      setValue(17);
    }, 980);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [active]);

  return (
    <PrimitiveStage title="Flip number">
      <div className="flex items-center justify-center">
        <span
          key={value}
          className={`text-5xl font-semibold text-amber-50 ${value === 17 ? 'score-flip' : ''}`}
        >
          {value}
        </span>
      </div>
    </PrimitiveStage>
  );
};

const meta = {
  title: 'Game/RoomScene/Animation Primitives',
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Bulge: Story = {
  render: () => <BulgePreview />,
};

export const ArriveCard: Story = {
  render: () => <ArriveCardPreview />,
};

export const ExpandCard: Story = {
  render: () => <ExpandCardPreview />,
};

export const FlipCard: Story = {
  render: () => <FlipCardPreview />,
};

export const FlightChip: Story = {
  render: () => <FlightChipPreview />,
};

export const FlightCard: Story = {
  render: () => <FlightCardPreview />,
};

export const FlipNumber: Story = {
  render: () => <FlipNumberPreview />,
};
