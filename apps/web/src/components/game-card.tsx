import { type Card, type GemColor, type Noble, type TokenColor } from '@splendor/game-engine';

import noble01Image from '../images/noble-01.png';
import noble02Image from '../images/noble-02.png';
import noble03Image from '../images/noble-03.png';
import noble04Image from '../images/noble-04.png';
import noble05Image from '../images/noble-05.png';
import noble06Image from '../images/noble-06.png';
import noble07Image from '../images/noble-07.png';
import noble08Image from '../images/noble-08.png';
import noble09Image from '../images/noble-09.png';
import noble10Image from '../images/noble-10.png';
import { gemOrder } from '../lib/game-ui.js';

const gemStyles: Readonly<Record<GemColor, string>> = {
  white: 'bg-stone-100 text-stone-900 ring-1 ring-stone-300/80',
  blue: 'bg-sky-400 text-sky-950',
  green: 'bg-emerald-400 text-emerald-950',
  red: 'bg-rose-400 text-rose-950',
  black: 'bg-stone-900 text-stone-100 ring-1 ring-stone-600',
  gold: 'bg-amber-300 text-amber-950 ring-1 ring-amber-200/40',
};

const gemIconStyles: Readonly<Record<TokenColor, string>> = {
  white:
    'h-[60%] w-[74%] rotate-[-14deg] [clip-path:polygon(0%_58%,_18%_26%,_58%_0%,_100%_16%,_78%_72%,_38%_100%)] bg-[linear-gradient(145deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.98)_22%,_rgba(203,213,225,0.92)_48%,_rgba(148,163,184,0.96)_70%,_rgba(51,65,85,0.82)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_-1px_-1px_0_rgba(71,85,105,0.22),0_1px_3px_rgba(51,65,85,0.28)]',
  blue:
    'h-[54%] w-[68%] rotate-[-10deg] rounded-[55%_45%_58%_42%/48%_44%_56%_52%] bg-[radial-gradient(circle_at_32%_26%,_rgba(186,230,253,1),_rgba(37,99,235,0.96)_40%,_rgba(30,41,59,1)_88%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_3px_rgba(30,41,59,0.28)]',
  green:
    'h-[68%] w-[54%] rounded-[18%] rotate-[10deg] [clip-path:polygon(18%_0%,_82%_0%,_100%_18%,_100%_82%,_82%_100%,_18%_100%,_0%_82%,_0%_18%)] bg-[linear-gradient(135deg,_rgba(220,252,231,0.98),_rgba(34,197,94,0.96)_44%,_rgba(6,95,70,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_1px_3px_rgba(6,78,59,0.22)]',
  red:
    'h-[64%] w-[62%] rotate-[8deg] rounded-[28%_32%_34%_26%/32%_28%_36%_30%] bg-[radial-gradient(circle_at_38%_28%,_rgba(254,226,226,1),_rgba(220,38,38,0.98)_42%,_rgba(127,29,29,1)_88%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_1px_3px_rgba(127,29,29,0.22)]',
  black:
    'h-[54%] w-[66%] rotate-[-14deg] rounded-[16%] [clip-path:polygon(12%_0%,_88%_0%,_100%_18%,_100%_82%,_88%_100%,_12%_100%,_0%_82%,_0%_18%)] bg-[linear-gradient(145deg,_rgba(146,138,133,0.72),_rgba(68,64,60,0.96)_22%,_rgba(24,24,27,1)_58%,_rgba(12,10,9,1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_-1px_-1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(12,10,9,0.34)]',
};

const gemHighlightStyles: Readonly<Record<TokenColor, string>> = {
  white: 'absolute left-[20%] top-[12%] h-[16%] w-[28%] rounded-full bg-white/92 blur-[1px]',
  blue: 'absolute left-[18%] top-[16%] h-[22%] w-[24%] rounded-full bg-cyan-200/50 blur-[1px]',
  green: 'absolute left-[18%] top-[14%] h-[22%] w-[18%] rounded-full bg-lime-100/40 blur-[1px]',
  red: 'absolute left-[18%] top-[14%] h-[20%] w-[18%] rounded-full bg-rose-100/40 blur-[1px]',
  black: 'absolute left-[16%] top-[16%] h-[18%] w-[26%] rounded-full bg-stone-200/14 blur-[1px]',
};

const cardSurfaceStyles: Readonly<Record<TokenColor, string>> = {
  white:
    'from-white via-slate-100 to-slate-400 text-stone-900 border-slate-300/90',
  blue: 'from-blue-100 via-blue-400 to-[#1565C0] text-blue-950 border-blue-300/90',
  green:
    'from-emerald-100 via-emerald-400 to-[#2E7D32] text-emerald-950 border-emerald-300/90',
  red: 'from-rose-100 via-red-400 to-[#C62828] text-red-950 border-red-300/90',
  black:
    'from-slate-700 via-slate-800 to-stone-950 text-stone-50 border-slate-500/80',
};

const deckSurfaceStyles: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'border-emerald-200/35 from-emerald-700 via-emerald-900 to-emerald-950 text-emerald-50',
  2: 'border-amber-200/35 from-amber-500 via-yellow-700 to-amber-950 text-amber-50',
  3: 'border-sky-200/35 from-sky-700 via-blue-900 to-sky-950 text-sky-50',
};

const nobleImageById: Readonly<Record<string, string>> = {
  'noble-1': noble01Image,
  'noble-2': noble02Image,
  'noble-3': noble03Image,
  'noble-4': noble04Image,
  'noble-5': noble05Image,
  'noble-6': noble06Image,
  'noble-7': noble07Image,
  'noble-8': noble08Image,
  'noble-9': noble09Image,
  'noble-10': noble10Image,
};

export const getNobleImageSrc = (nobleId: string): string =>
  nobleImageById[nobleId] ?? noble01Image;

const circleClass = (color: GemColor): string =>
  `inline-flex items-center justify-center rounded-full ${gemStyles[color]}`;

export interface GemPipProps {
  readonly color: GemColor;
  readonly count?: number;
  readonly size?: 'xs' | 'sm' | 'md';
}

const GemIcon = ({
  color,
  size,
}: {
  readonly color: TokenColor;
  readonly size: GemPipProps['size'];
}) => (
  <span
    className={`relative inline-flex shrink-0 items-center justify-center ${
      size === 'xs'
        ? 'h-4 w-4'
        : size === 'sm'
          ? 'h-5 w-5'
          : 'h-6 w-6'
    }`}
  >
    <span className={`relative inline-flex items-center justify-center ${gemIconStyles[color]}`}>
      <span className={gemHighlightStyles[color]} />
    </span>
  </span>
);

export const GemPip = ({ color, count, size = 'md' }: GemPipProps) => {
  if (typeof count !== 'number' && color !== 'gold') {
    return (
      <span
        className={`inline-flex items-center justify-center ${
          size === 'xs'
            ? 'h-5 w-5'
            : size === 'sm'
              ? 'h-7 w-7'
              : 'h-9 w-9'
        }`}
      >
        <GemIcon color={color} size={size} />
      </span>
    );
  }

  return (
    <span
      className={`${circleClass(color)} ${
        size === 'xs'
          ? 'h-5 min-w-5 px-1 text-[10px]'
          : size === 'sm'
            ? 'h-7 min-w-7 px-2 text-[11px]'
            : 'h-9 min-w-9 px-2.5 text-sm'
      } font-bold shadow-sm`}
    >
      {typeof count === 'number' ? count : ''}
    </span>
  );
};

export interface SplendorCardProps {
  readonly card: Card;
  readonly disabled?: boolean;
  readonly isSelected?: boolean;
  readonly onPress?: () => void;
  readonly size?: 'tiny' | 'compact' | 'full';
}

export const SplendorCard = ({
  card,
  disabled = false,
  isSelected = false,
  onPress,
  size = 'compact',
}: SplendorCardProps) => {
  const isInteractive = typeof onPress === 'function';
  const isTiny = size === 'tiny';
  const isCompact = size === 'compact';

  return (
    <button
      className={`relative flex ${
        isTiny
          ? 'aspect-[5/7] w-full min-w-0 rounded-[0.9rem] p-1'
          : isCompact
            ? 'aspect-[5/7] w-full min-w-0 rounded-[1.05rem] p-1.5'
            : 'aspect-[5/7] w-full rounded-[1.7rem] p-3'
      } flex-col overflow-hidden border bg-linear-to-br text-left shadow-lg transition ${
        cardSurfaceStyles[card.bonus]
      } ${
        isSelected ? 'ring-4 ring-amber-300/70' : 'ring-1 ring-black/5'
      } ${isInteractive && !disabled ? 'active:scale-[0.98]' : ''} ${
        disabled ? 'opacity-70' : ''
      }`}
      disabled={!isInteractive || disabled}
      onClick={onPress}
      type="button"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.72),_transparent_22%),linear-gradient(180deg,_rgba(255,255,255,0.24),_transparent_45%)]" />
      <div
        className={`relative -mx-1.5 -mt-1.5 mb-1 flex items-start justify-between gap-2 rounded-t-[inherit] border-b border-black/8 bg-[linear-gradient(180deg,_rgba(226,232,240,0.56),_rgba(214,211,209,0.28))] px-1.5 pt-1.5 pb-1 ${
          isTiny
            ? 'min-h-7'
            : isCompact
              ? 'min-h-9'
              : 'min-h-12'
        }`}
      >
        <span className={`font-serif leading-none drop-shadow-sm ${
          isTiny ? 'text-[1.35rem]' : isCompact ? 'text-[1.7rem]' : 'text-4xl'
        }`}>
          {card.points > 0 ? card.points : ''}
        </span>
        <GemPip color={card.bonus} size={isTiny ? 'xs' : isCompact ? 'sm' : 'md'} />
      </div>
      <div className={`relative ${
        isTiny
          ? 'mt-0.5 gap-0.5 grid grid-cols-2 justify-items-start content-end'
          : isCompact
            ? 'mt-1 gap-1 grid grid-cols-2 justify-items-start content-end'
            : 'mt-3 gap-2 flex flex-wrap items-end'
      }`}>
        {gemOrder
          .filter((color): color is TokenColor => color !== 'gold' && card.cost[color] > 0)
          .map((color) => (
            <GemPip
              key={`${card.id}-${color}`}
              color={color}
              count={card.cost[color]}
              size={isTiny ? 'xs' : isCompact ? 'xs' : 'sm'}
            />
          ))}
      </div>
    </button>
  );
};

export interface DeckCardProps {
  readonly disabled?: boolean;
  readonly isSelected?: boolean;
  readonly onPress?: () => void;
  readonly remainingCount: number;
  readonly size?: 'compact' | 'full';
  readonly tier: 1 | 2 | 3;
}

export const DeckCard = ({
  disabled = false,
  isSelected = false,
  onPress,
  remainingCount,
  size = 'compact',
  tier,
}: DeckCardProps) => {
  const isCompact = size === 'compact';

  return (
    <button
      aria-label={`Tier ${tier} deck`}
      className={`relative flex ${isCompact ? 'aspect-[5/7] w-full min-w-0 rounded-[1.05rem] p-2' : 'aspect-[5/7] w-full rounded-[1.7rem] p-3'} flex-col justify-between overflow-hidden border bg-linear-to-br text-left shadow-lg transition ${
        deckSurfaceStyles[tier]
      } ${
        isSelected ? 'ring-4 ring-amber-300/70' : ''
      } ${typeof onPress === 'function' && !disabled ? 'active:scale-[0.98]' : ''}`}
      disabled={typeof onPress !== 'function' || disabled}
      onClick={onPress}
      type="button"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_24%),linear-gradient(135deg,_rgba(255,255,255,0.12),_transparent_40%,_rgba(0,0,0,0.18))]" />
      <div className="absolute inset-[10%] rounded-[0.8rem] border border-white/10 bg-[linear-gradient(135deg,_rgba(255,255,255,0.08),_transparent_38%,_rgba(0,0,0,0.12))]" />
      <div className={`relative flex flex-1 items-center justify-center`}>
        <span className={`font-serif leading-none ${isCompact ? 'text-[1.85rem] text-white/72' : 'text-4xl text-white/78'}`}>{remainingCount}</span>
      </div>
      <div className="relative flex items-center justify-center gap-1.5">
        {Array.from({ length: tier }, (_, index) => (
          <span
            key={`tier-dot-${tier}-${index}`}
            className={`${isCompact ? 'h-1.5 w-1.5' : 'h-2 w-2'} rounded-full bg-white/95 shadow-[0_0_8px_rgba(255,255,255,0.3)]`}
          />
        ))}
      </div>
    </button>
  );
};

export interface NobleTileProps {
  readonly isSelected?: boolean;
  readonly noble: Noble;
  readonly onPress?: () => void;
  readonly size?: 'compact' | 'full';
}

export const NobleTile = ({
  isSelected = false,
  noble,
  onPress,
  size = 'compact',
}: NobleTileProps) => {
  const isCompact = size === 'compact';
  const nobleImage = getNobleImageSrc(noble.id);

  return (
    <button
      className={`relative w-full ${isCompact ? 'aspect-square rounded-[0.85rem] p-2' : 'rounded-[1.15rem] p-4'} overflow-hidden border bg-stone-950 text-left text-emerald-50 shadow-lg transition ${
        isSelected ? 'border-emerald-300/80 outline-2 outline-offset-2 outline-emerald-300/55' : 'border-emerald-200/20'
      } ${
        typeof onPress === 'function' ? 'active:scale-[0.99]' : ''
      }`}
      disabled={typeof onPress !== 'function'}
      onClick={onPress}
      type="button"
    >
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        src={nobleImage}
      />
      <div className={`relative flex h-full flex-col ${isCompact ? '' : ''}`}>
        <p className={`relative font-serif text-emerald-50 drop-shadow-sm ${isCompact ? 'text-lg' : 'mt-2 text-2xl'}`}>{noble.points}</p>
        <div className={`relative mt-auto flex flex-wrap ${isCompact ? 'gap-1' : 'gap-2'}`}>
          {gemOrder
            .filter((color): color is TokenColor => color !== 'gold' && noble.requirement[color] > 0)
            .map((color) => (
              <GemPip
                key={`${noble.id}-${color}`}
                color={color}
                count={noble.requirement[color]}
                size={isCompact ? 'xs' : 'sm'}
              />
            ))}
        </div>
      </div>
    </button>
  );
};
