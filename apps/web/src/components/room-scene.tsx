import {
  getAutoPayment,
  getCardEffectiveCost,
  isValidPaymentForCard,
  NOBLES,
  type Card,
  type CardTier,
  type GameState,
  type GemColor,
  type Move,
  type PaymentSelection,
  type TokenColor,
} from '@splendor/game-engine';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Undo,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import { ActionSheet } from './action-sheet.js';
import { DeckCard, GemPip, getNobleImageSrc, NobleTile, SplendorCard } from './game-card.js';
import { GameCompleteScreen } from './game-complete-screen.js';
import { type AppUser } from '../lib/auth.js';
import { animationCssVars } from '../lib/animation-config.js';
import { deriveAnimationPlan } from '../lib/animation-plan.js';
import { useAnimationRunner } from '../lib/animation-runner.js';
import { animationTargets } from '../lib/animation-targets.js';
import { type AnimationStep } from '../lib/animation-types.js';
import {
  cardTierOrder,
  deriveInteractionModel,
  derivePlayerSummaries,
  gemOrder,
  tokenColorOrder,
  type PlayerSummaryModel,
} from '../lib/game-ui.js';
import {
  deriveRoomHistoryEntries,
  type RoomActivityEntry,
} from '../lib/room-activity.js';
import { type PublicRoomState, type RoomParticipant } from '../lib/types.js';

type Selection =
  | { readonly type: 'market-card'; readonly cardId: string }
  | { readonly type: 'reserved-card'; readonly cardId: string }
  | { readonly type: 'deck'; readonly tier: CardTier }
  | { readonly type: 'bank' }
  | { readonly type: 'menu' }
  | { readonly type: 'player'; readonly playerId: string }
  | null;

type BoardPanel = 'board' | 'nobles' | 'log';

interface PlayerReceiveAnimation {
  readonly changedChipColors: readonly GemColor[];
  readonly changedTableauColors: readonly TokenColor[];
  readonly reservedChanged: boolean;
  readonly scoreChanged: boolean;
}

interface SourceChipBulges {
  readonly bankColors: readonly GemColor[];
  readonly playerColorsById: Readonly<Record<string, readonly GemColor[]>>;
}

interface ReplaySelection {
  readonly afterStateVersion: number;
  readonly beforeStateVersion: number;
  readonly entryId: string | null;
  readonly nonce: number;
}

const ReplayIconButton = ({
  children,
  disabled = false,
  label,
  onClick,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) => (
  <button
    aria-label={label}
    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/18 bg-sky-950/26 text-sky-50 transition hover:bg-sky-950/40 disabled:cursor-not-allowed disabled:opacity-35"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const tokenRingStyles: Readonly<Record<TokenColor, string>> = {
  white: 'outline-stone-300/80',
  blue: 'outline-sky-300/70',
  green: 'outline-emerald-300/70',
  red: 'outline-rose-300/70',
  black: 'outline-stone-500/80',
};

const subtleButtonClass =
  'rounded-full border border-white/12 bg-white/5 px-3 py-2 text-sm font-medium text-stone-100 transition hover:border-white/20 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45';

const primaryButtonClass =
  'rounded-full bg-amber-300 px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400';

const panelToggleButtonClass =
  'rounded-full px-3 py-2 text-sm font-medium transition';

const roomCodeLabel = (roomId: string): string =>
  roomId.length > 10 ? roomId.slice(0, 10).toUpperCase() : roomId.toUpperCase();

const createTokenList = (tokens: GameState['bank']): readonly GemColor[] =>
  gemOrder.flatMap((color) => Array.from({ length: tokens[color] }, () => color));

const normalizeGemSelection = (tokens: readonly GemColor[]): readonly GemColor[] =>
  [...tokens].sort((left, right) => gemOrder.indexOf(left) - gemOrder.indexOf(right));

const discardMoveMatchesSelection = (
  move: Extract<Move, { readonly type: 'discard-tokens' }>,
  tokens: readonly GemColor[],
): boolean => {
  const left = normalizeGemSelection(move.tokens);
  const right = normalizeGemSelection(tokens);

  return left.length === right.length && left.every((color, index) => color === right[index]);
};

const countGemSelection = (tokens: readonly GemColor[]): Readonly<Record<GemColor, number>> =>
  gemOrder.reduce<Record<GemColor, number>>((result, color) => {
    return {
      ...result,
      [color]: tokens.filter((token) => token === color).length,
    };
  }, {} as Record<GemColor, number>);

const countTokenSelection = (
  tokens: readonly TokenColor[],
): Readonly<Record<TokenColor, number>> =>
  tokenColorOrder.reduce<Record<TokenColor, number>>((result, color) => {
    return {
      ...result,
      [color]: tokens.filter((token) => token === color).length,
    };
  }, {} as Record<TokenColor, number>);

const normalizeTokenSelection = (tokens: readonly TokenColor[]): readonly TokenColor[] =>
  [...tokens].sort((left, right) => tokenColorOrder.indexOf(left) - tokenColorOrder.indexOf(right));

const selectionCanBecomeLegalBankMove = (
  tokens: readonly TokenColor[],
  interaction: ReturnType<typeof deriveInteractionModel> | null,
): boolean => {
  if (!interaction || tokens.length === 0 || tokens.length > 3) {
    return false;
  }

  const normalizedSelection = normalizeTokenSelection(tokens);

  return (
    interaction.distinctMoves.some((move) => {
      const normalizedMove = normalizeTokenSelection(move.colors);

      return (
        normalizedSelection.length <= normalizedMove.length &&
        normalizedSelection.every((color, index) => color === normalizedMove[index])
      );
    }) ||
    tokenColorOrder.some((color) => {
      const pairMove = interaction.pairMovesByColor[color];

      return (
        pairMove !== undefined &&
        normalizedSelection.length <= 2 &&
        normalizedSelection.every((entry) => entry === color)
      );
    })
  );
};

const totalSelectedPayment = (payment: PaymentSelection): number =>
  tokenColorOrder.reduce((sum, color) => sum + payment.tokens[color], payment.gold);

const createEmptyPaymentSelection = (): PaymentSelection => ({
  tokens: tokenColorOrder.reduce<Record<TokenColor, number>>((result, color) => {
    return {
      ...result,
      [color]: 0,
    };
  }, {} as Record<TokenColor, number>),
  gold: 0,
});

const getFallbackNobleFlightOrigin = (): { readonly x: number; readonly y: number } => {
  if (typeof window === 'undefined') {
    return { x: 148, y: 640 };
  }

  return {
    x: window.innerWidth / 2 - 40,
    y: window.innerHeight - 112,
  };
};

const currentUserIsParticipant = (
  participants: readonly RoomParticipant[],
  currentUserId: string | undefined,
): boolean => participants.some((participant) => participant.userId === currentUserId);

const statusLabel = (room: PublicRoomState | null): string => {
  if (!room) {
    return 'Loading';
  }

  if (room.status === 'waiting') {
    return 'Waiting';
  }

  if (!room.game) {
    return 'Starting';
  }

  if (room.game.status === 'finished') {
    return 'Finished';
  }

  if (room.game.turn.kind === 'discard') {
    return 'Discard';
  }

  if (room.game.turn.kind === 'noble') {
    return 'Noble';
  }

  return 'Action';
};

const turnBannerCopy = (
  game: GameState,
  isCurrentUsersTurn: boolean,
  activePlayerName: string,
): string => {
  if (game.status === 'finished') {
    const winners = game.result?.winners ?? [];

    return winners.length > 0 ? `Win: ${winners.join(', ')}` : 'Game complete';
  }

  if (game.turn.kind === 'discard') {
    return isCurrentUsersTurn
      ? `Discard ${game.turn.requiredCount}`
      : `${activePlayerName} discarding`;
  }

  if (game.turn.kind === 'noble') {
    return isCurrentUsersTurn ? 'Choose noble' : `${activePlayerName} choosing noble`;
  }

  return isCurrentUsersTurn ? 'Your turn' : `${activePlayerName} to act`;
};

const tableauBadgeStyles: Readonly<Record<TokenColor, string>> = {
  white: 'border-stone-300/80 bg-stone-100/95 text-stone-950',
  blue: 'border-sky-300/60 bg-sky-500/85 text-sky-50',
  green: 'border-emerald-300/60 bg-emerald-500/85 text-emerald-50',
  red: 'border-rose-300/60 bg-rose-500/85 text-rose-50',
  black: 'border-stone-500/80 bg-stone-900/90 text-stone-50',
};

const reservedMarkerStyles = [
  'border-emerald-200/35 from-emerald-700 via-emerald-900 to-emerald-950',
  'border-amber-200/35 from-amber-500 via-yellow-700 to-amber-950',
  'border-sky-200/35 from-sky-700 via-blue-900 to-sky-950',
] as const;

const floatingChipStyles: Readonly<Record<GemColor, string>> = {
  white:
    'border border-stone-400/85 bg-stone-200 text-stone-900 shadow-[0_0_0_1px_rgba(255,255,255,0.45),0_10px_22px_rgba(255,255,255,0.18)]',
  blue:
    'border border-sky-500/70 bg-sky-100 text-sky-900 shadow-[0_0_0_1px_rgba(125,211,252,0.22),0_10px_22px_rgba(56,189,248,0.22)]',
  green:
    'border border-emerald-500/70 bg-emerald-100 text-emerald-900 shadow-[0_0_0_1px_rgba(110,231,183,0.22),0_10px_22px_rgba(52,211,153,0.22)]',
  red:
    'border border-rose-500/70 bg-rose-100 text-rose-900 shadow-[0_0_0_1px_rgba(253,164,175,0.22),0_10px_22px_rgba(251,113,133,0.22)]',
  black:
    'border border-slate-500/80 bg-slate-300 text-slate-950 shadow-[0_0_0_1px_rgba(120,113,108,0.35),0_10px_22px_rgba(24,24,27,0.24)]',
  gold:
    'border border-amber-400/70 bg-amber-100 text-amber-900 shadow-[0_0_0_1px_rgba(253,230,138,0.2),0_10px_22px_rgba(252,211,77,0.24)]',
};

const emptyPlayerReceiveAnimation: PlayerReceiveAnimation = {
  changedChipColors: [],
  changedTableauColors: [],
  reservedChanged: false,
  scoreChanged: false,
};

const groupChipFlights = (
  flights: ReturnType<typeof useAnimationRunner>['chipFlights'],
) => {
  const grouped = new Map<
    string,
    {
      readonly color: GemColor;
      count: number;
      readonly delayMs?: number;
      readonly durationMs?: number;
      readonly from: string;
      readonly fromX: number;
      readonly fromY: number;
      readonly id: string;
      readonly to: string;
      readonly toX: number;
      readonly toY: number;
    }
  >();

  for (const flight of flights) {
    const key = `${flight.color}:${flight.from}:${flight.to}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    grouped.set(key, {
      color: flight.color,
      count: 1,
      ...(flight.delayMs ? { delayMs: flight.delayMs } : {}),
      ...(flight.durationMs ? { durationMs: flight.durationMs } : {}),
      from: flight.from,
      fromX: flight.fromX,
      fromY: flight.fromY,
      id: flight.id,
      to: flight.to,
      toX: flight.toX,
      toY: flight.toY,
    });
  }

  return [...grouped.values()];
};

const spreadGroupedChipFlights = (
  flights: ReturnType<typeof groupChipFlights>,
) => {
  const pathGroups = new Map<string, typeof flights>();

  for (const flight of flights) {
    const key = `${flight.from}:${flight.to}`;
    const existing = pathGroups.get(key) ?? [];
    existing.push(flight);
    pathGroups.set(key, existing);
  }

  return [...pathGroups.values()].flatMap((group) => {
    const ordered = [...group].sort(
      (left, right) => gemOrder.indexOf(left.color) - gemOrder.indexOf(right.color),
    );

    return ordered.map((flight, index) => {
      const centeredIndex = index - (ordered.length - 1) / 2;
      const laneOffsetX = centeredIndex * 18;
      const laneOffsetY = Math.abs(centeredIndex) * 4;

      return {
        ...flight,
        laneOffsetX,
        laneOffsetY,
      };
    });
  });
};

const deriveActiveAnimationState = (
  activeTargets: ReturnType<typeof useAnimationRunner>['activeTargets'],
): {
  readonly changedBankColors: readonly GemColor[];
  readonly changedDeckTiers: readonly CardTier[];
  readonly changedMarketCardIds: readonly string[];
  readonly changedPlayerIds: readonly string[];
} => ({
  changedBankColors: gemOrder.filter((color) => activeTargets.bulge.has(animationTargets.bankChip(color))),
  changedDeckTiers: cardTierOrder.filter((tier) => activeTargets.bulge.has(animationTargets.deck(tier))),
  changedMarketCardIds: Array.from(activeTargets.arriveCard)
    .filter((targetId) => targetId.startsWith('market:'))
    .map((targetId) => targetId.replace('market:', '')),
  changedPlayerIds: Array.from(activeTargets.highlightRow)
    .filter((targetId) => targetId.startsWith('player:') && targetId.endsWith(':row'))
    .map((targetId) => targetId.split(':')[1]!)
    .filter((playerId, index, playerIds) => playerIds.indexOf(playerId) === index),
});

const deriveTargetPlayerAnimations = (
  activeTargets: ReturnType<typeof useAnimationRunner>['activeTargets'],
  players: readonly PlayerSummaryModel[],
): Readonly<Record<string, PlayerReceiveAnimation>> =>
  players.reduce<Record<string, PlayerReceiveAnimation>>((result, player) => {
    return {
      ...result,
      [player.id]: {
        changedChipColors: gemOrder.filter((color) =>
          activeTargets.bulge.has(animationTargets.playerChip(player.id, color)),
        ),
        changedTableauColors: tokenColorOrder.filter((color) =>
          activeTargets.bulge.has(animationTargets.playerTableauBonus(player.id, color)),
        ),
        reservedChanged: activeTargets.bulge.has(animationTargets.playerReserved(player.id)),
        scoreChanged: activeTargets.flipNumber.has(animationTargets.playerScore(player.id)),
      },
    };
  }, {});

const deriveSourceChipBulgeState = (
  activeTargets: ReturnType<typeof useAnimationRunner>['activeTargets'],
  players: readonly PlayerSummaryModel[],
): SourceChipBulges => ({
  bankColors: gemOrder.filter((color) => activeTargets.bulge.has(animationTargets.bankChip(color))),
  playerColorsById: players.reduce<Record<string, readonly GemColor[]>>((result, player) => {
    return {
      ...result,
      [player.id]: gemOrder.filter((color) =>
        activeTargets.bulge.has(animationTargets.playerChip(player.id, color)),
      ),
    };
  }, {}),
});

const ChipStrip = ({
  counts,
  highlightedColors = [],
  immediateHighlightedColors = [],
  targetRefByColor,
}: {
  readonly counts: Readonly<Record<GemColor, number>>;
  readonly highlightedColors?: readonly GemColor[];
  readonly immediateHighlightedColors?: readonly GemColor[];
  readonly targetRefByColor?: Readonly<Partial<Record<GemColor, (node: HTMLSpanElement | null) => void>>>;
}) => (
  <div className="flex flex-wrap items-center gap-1">
    {gemOrder.map((color) => (
      <span
        key={`chip-${color}`}
        ref={targetRefByColor?.[color]}
        className={`${counts[color] > 0 ? '' : 'opacity-25'} ${
          immediateHighlightedColors.includes(color) ? 'receive-bulge' : ''
        } ${
          highlightedColors.includes(color) ? 'receive-bulge' : ''
        }`}
      >
        <GemPip color={color} count={counts[color]} size="summary" />
      </span>
    ))}
  </div>
);

const TableauStrip = ({
  counts,
  highlightedColors = [],
}: {
  readonly counts: PlayerSummaryModel['tableauBonuses'];
  readonly highlightedColors?: readonly TokenColor[];
}) => (
  <div className="flex flex-wrap items-center gap-1">
    {tokenColorOrder.map((color) => (
      <span
        key={`tableau-${color}`}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-[0.45rem] border text-[10px] font-bold leading-none shadow-sm ${
          tableauBadgeStyles[color]
        } ${counts[color] > 0 ? '' : 'opacity-35'} ${
          highlightedColors.includes(color) ? 'receive-bulge receive-bulge-delay' : ''
        }`}
      >
        {counts[color]}
      </span>
    ))}
  </div>
);

const ReservedMarkers = ({
  isHighlighted = false,
  tiers,
}: {
  readonly isHighlighted?: boolean;
  readonly tiers: readonly (1 | 2 | 3)[];
}) => (
  <div className="flex items-center gap-1">
    {tiers.map((tier, index) => (
      <span
        key={`reserved-marker-${index}`}
        className={`relative h-5 w-3.5 rounded-[0.35rem] border bg-linear-to-br shadow-sm ${
          reservedMarkerStyles[tier - 1]
        } ${isHighlighted ? 'receive-bulge receive-bulge-delay' : ''}`}
      >
        <span className="absolute inset-[2px] rounded-[0.28rem] border border-white/10 bg-[linear-gradient(135deg,_rgba(255,255,255,0.08),_transparent_40%,_rgba(0,0,0,0.18))]" />
      </span>
    ))}
    {tiers.length === 0 ? <span className="text-[11px] text-stone-500">0</span> : null}
  </div>
);

const HiddenReservedCards = ({ tiers }: { readonly tiers: readonly (1 | 2 | 3)[] }) => (
  <div className="grid grid-cols-5 gap-1.5">
    {tiers.length > 0 ? (
      tiers.map((tier, index) => (
        <span
          key={`hidden-reserved-${index}`}
          className={`relative aspect-[5/7] w-full overflow-hidden rounded-[0.9rem] border bg-linear-to-br shadow-sm ${
            reservedMarkerStyles[tier - 1]
          }`}
        >
          <span className="absolute inset-[8%] rounded-[0.7rem] border border-white/10 bg-[linear-gradient(135deg,_rgba(255,255,255,0.08),_transparent_38%,_rgba(0,0,0,0.14))]" />
        </span>
      ))
    ) : (
      <p className="col-span-5 text-sm text-stone-500">No reserved cards.</p>
    )}
  </div>
);

const NobleMarkers = ({ nobleIds }: { readonly nobleIds: readonly string[] }) => (
  <div className="flex items-center gap-1">
    {nobleIds.map((nobleId) => (
      <span
        key={`claimed-noble-${nobleId}`}
        className="relative h-6 w-6 overflow-hidden rounded-[0.45rem] border border-emerald-200/30 bg-stone-950 shadow-sm"
      >
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          src={getNobleImageSrc(nobleId)}
        />
      </span>
    ))}
    {nobleIds.length === 0 ? <span className="text-[11px] text-stone-500">0</span> : null}
  </div>
);

const PlayerSummaryRow = ({
  chipTargetRefByColor,
  currentUserId,
  isRecentlyUpdated,
  nobleTargetRef,
  playerAnimation,
  sourceChipBulges,
  onPress,
  player,
  rowRef,
  room,
  reservedTargetRef,
  tableauTargetRef,
}: {
  readonly chipTargetRefByColor?: Readonly<
    Partial<Record<GemColor, (node: HTMLSpanElement | null) => void>>
  >;
  readonly currentUserId: string | undefined;
  readonly isRecentlyUpdated: boolean;
  readonly nobleTargetRef?: (node: HTMLDivElement | null) => void;
  readonly playerAnimation: PlayerReceiveAnimation;
  readonly sourceChipBulges: readonly GemColor[];
  readonly onPress: () => void;
  readonly player: PlayerSummaryModel;
  readonly rowRef?: (node: HTMLButtonElement | null) => void;
  readonly room: PublicRoomState;
  readonly reservedTargetRef?: (node: HTMLDivElement | null) => void;
  readonly tableauTargetRef?: (node: HTMLDivElement | null) => void;
}) => {
  const isActive = room.game?.players[room.game.turn.activePlayerIndex]?.identity.id === player.id;
  const isCurrentUser = player.id === currentUserId;
  const isWaitingOnOpponent = isActive && !isCurrentUser;
  const totalTableauCards = tokenColorOrder.reduce(
    (sum, color) => sum + player.tableauBonuses[color],
    0,
  );
  const totalChips = gemOrder.reduce((sum, color) => sum + player.tokens[color], 0);

  return (
    <button
      ref={rowRef}
      className={`relative w-full overflow-hidden rounded-[1rem] border px-2.5 py-1.5 text-left ${
        isActive && isCurrentUser
          ? 'border-amber-300/45 bg-amber-300/10'
          : isWaitingOnOpponent
            ? 'border-sky-300/35 bg-sky-400/8'
            : 'border-white/8 bg-white/3'
      } ${isRecentlyUpdated ? 'player-row-receive' : ''}`}
      onClick={onPress}
      type="button"
    >
      {isWaitingOnOpponent ? (
        <span
          aria-hidden="true"
          className="player-waiting-sheen pointer-events-none absolute inset-y-0 left-[-22%] w-1/3"
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-stone-50">{player.displayName}</span>
            {isCurrentUser ? (
              <span className="inline-flex h-5 items-center rounded-full border border-sky-300/25 px-2 text-[9px] leading-none uppercase tracking-[0.15em] text-sky-200">
                You
              </span>
            ) : null}
            {isWaitingOnOpponent ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-sky-300/25 bg-sky-300/8 px-2 text-[9px] leading-none uppercase tracking-[0.18em] text-sky-200/90">
                <span className="player-waiting-dot h-1.5 w-1.5 rounded-full bg-sky-300" />
                Waiting
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.18em] text-stone-500">VP</p>
          <p
            className={`text-[1.05rem] leading-none font-semibold text-amber-50 ${
              playerAnimation.scoreChanged ? 'score-flip' : ''
            }`}
          >
            {player.score}
          </p>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[3.9rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-stone-500">
          Cards ({totalTableauCards})
        </p>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div ref={tableauTargetRef} className="min-w-0">
            <TableauStrip
              counts={player.tableauBonuses}
              highlightedColors={playerAnimation.changedTableauColors}
            />
          </div>
          <div className="flex items-center gap-2 justify-self-end">
            <div ref={reservedTargetRef}>
              <ReservedMarkers
                isHighlighted={playerAnimation.reservedChanged}
                tiers={player.reservedTiers}
              />
            </div>
            {player.nobleIds.length > 0 ? (
              <div className="min-w-0">
                <NobleMarkers nobleIds={player.nobleIds} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-0.75 grid grid-cols-[3.9rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-stone-500">
          Chips ({totalChips})
        </p>
        <div className="min-w-0">
          <ChipStrip
            counts={player.tokens}
            highlightedColors={playerAnimation.changedChipColors}
            immediateHighlightedColors={sourceChipBulges}
            {...(chipTargetRefByColor ? { targetRefByColor: chipTargetRefByColor } : {})}
          />
        </div>
      </div>
      <div
        ref={nobleTargetRef}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.25 bottom-2 h-6 w-6 opacity-0"
      />
    </button>
  );
};

export interface RoomSceneProps {
  readonly initialActivePanel?: BoardPanel;
  readonly currentUserId: string | undefined;
  readonly errorMessage: string | null;
  readonly onResign: () => void;
  readonly initialReplayAfterStateVersion?: number;
  readonly initialSelection?: Selection;
  readonly initialResultsVisible?: boolean;
  readonly isSocketConnected: boolean;
  readonly isWorking: boolean;
  readonly onBootParticipant: (userId: string) => void;
  readonly onJoinRoom: () => void;
  readonly onLogout: () => void;
  readonly onStartGame: () => void;
  readonly onSubmitMove: (move: Move) => void;
  readonly room: PublicRoomState | null;
  readonly roomHistory?: readonly PublicRoomState[];
  readonly roomId: string;
  readonly user: AppUser | undefined;
}

export const RoomScene = ({
  initialActivePanel = 'board',
  currentUserId,
  errorMessage,
  initialReplayAfterStateVersion,
  initialSelection = null,
  initialResultsVisible,
  isSocketConnected,
  isWorking,
  onBootParticipant,
  onJoinRoom,
  onLogout,
  onResign,
  onStartGame,
  onSubmitMove,
  room: sourceRoom,
  roomHistory = [],
  roomId,
}: RoomSceneProps) => {
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [activePanel, setActivePanel] = useState<BoardPanel>(initialActivePanel);
  const [bankSelection, setBankSelection] = useState<readonly TokenColor[]>([]);
  const [discardSelection, setDiscardSelection] = useState<readonly GemColor[]>([]);
  const [isConfirmingResign, setIsConfirmingResign] = useState(false);
  const normalizedRoomHistory = useMemo(() => {
    const byVersion = new Map<number, PublicRoomState>();

    for (const entry of roomHistory) {
      byVersion.set(entry.stateVersion, entry);
    }

    if (sourceRoom) {
      byVersion.set(sourceRoom.stateVersion, sourceRoom);
    }

    return [...byVersion.values()].sort((left, right) => left.stateVersion - right.stateVersion);
  }, [roomHistory, sourceRoom]);
  const [activityEntries, setActivityEntries] = useState<readonly RoomActivityEntry[]>(() =>
    deriveRoomHistoryEntries(normalizedRoomHistory),
  );
  const [purchaseSelection, setPurchaseSelection] = useState<PaymentSelection>(createEmptyPaymentSelection);
  const [showGameComplete, setShowGameComplete] = useState(
    initialResultsVisible ?? sourceRoom?.game?.status === 'finished',
  );
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySelection, setReplaySelection] = useState<ReplaySelection | null>(null);
  const playerSummaryContainerRef = useRef<HTMLDivElement | null>(null);
  const playerSummaryRowRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const replayWasAnimatingRef = useRef(false);
  const targetNodeRefs = useRef<Partial<Record<string, HTMLElement | null>>>({});
  const overlayRectCacheRef = useRef<{
    readonly planId: string | null;
    readonly rects: Map<string, { readonly height: number; readonly left: number; readonly top: number; readonly width: number }>;
  }>({
    planId: null,
    rects: new Map(),
  });
  const resolveTargetRect = useCallback((targetId: string) => {
    if (targetId === animationTargets.viewportNobleOrigin()) {
      const origin = getFallbackNobleFlightOrigin();

      return {
        height: 68,
        left: origin.x,
        top: origin.y,
        width: 68,
      };
    }

    const node = targetNodeRefs.current[targetId];

    if (!node) {
      return null;
    }

    const rect = node.getBoundingClientRect();

    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  }, []);
  const roomHistoryByVersion = useMemo(
    () => new Map(normalizedRoomHistory.map((entry) => [entry.stateVersion, entry])),
    [normalizedRoomHistory],
  );
  const replayBeforeRoom = replaySelection
    ? roomHistoryByVersion.get(replaySelection.beforeStateVersion) ?? null
    : null;
  const replayAfterRoom = replaySelection
    ? roomHistoryByVersion.get(replaySelection.afterStateVersion) ?? null
    : null;
  const replayResetKey = replaySelection
    ? `replay:${replaySelection.entryId}:${replaySelection.nonce}`
    : `live:${sourceRoom?.id ?? 'none'}`;
  const animationFrame = useAnimationRunner({
    canonicalRoom: replayAfterRoom ?? sourceRoom,
    derivePlan: deriveAnimationPlan,
    initialPresentedRoom: replayBeforeRoom ?? null,
    resetKey: replayResetKey,
    resolveTargetRect,
  });
  const room = animationFrame.presentedRoom;
  const game = room?.game ?? null;
  const interaction = game ? deriveInteractionModel(game, currentUserId) : null;
  const playerSummaries = game ? derivePlayerSummaries(game) : [];
  const animationState = deriveActiveAnimationState(animationFrame.activeTargets);
  const chipFlights = animationFrame.chipFlights;
  const shortChipFlights = animationFrame.shortChipFlights;
  const groupedChipFlights = useMemo(() => groupChipFlights(chipFlights), [chipFlights]);
  const groupedShortChipFlights = useMemo(
    () => groupChipFlights(shortChipFlights),
    [shortChipFlights],
  );
  const displayedChipFlights = useMemo(
    () => spreadGroupedChipFlights(groupedChipFlights),
    [groupedChipFlights],
  );
  const displayedShortChipFlights = useMemo(
    () => spreadGroupedChipFlights(groupedShortChipFlights),
    [groupedShortChipFlights],
  );
  const playerAnimations = deriveTargetPlayerAnimations(animationFrame.activeTargets, playerSummaries);
  const sourceChipBulges = deriveSourceChipBulgeState(animationFrame.activeTargets, playerSummaries);
  const cardFlights = animationFrame.cardFlights;
  const isPresentingTransition = animationFrame.isAnimating;
  const wasFinishedRef = useRef(game?.status === 'finished');
  const pendingFinishedOverlayRef = useRef(false);
  const joined = room ? currentUserIsParticipant(room.participants, currentUserId) : false;
  const canJoin = room !== null && !joined && room.status === 'waiting';
  const canStart =
    room !== null &&
    room.hostUserId === currentUserId &&
    room.status === 'waiting' &&
    room.participants.length >= 2;
  const canSubmitRealtimeMoves =
    replaySelection !== null
      ? false
      : sourceRoom?.status === 'in_progress'
        ? isSocketConnected && !isPresentingTransition
        : true;
  // Allow UI interaction (opening modals, selecting cards) even during animations.
  // Only actual move submission is gated by canSubmitRealtimeMoves.
  const canOpenUI = replaySelection === null;

  useLayoutEffect(() => {
    setSelection(initialSelection);
    setBankSelection([]);
    setDiscardSelection([]);
    setPurchaseSelection(createEmptyPaymentSelection());
  }, [initialSelection, sourceRoom?.stateVersion]);

  useEffect(() => {
    if (selection?.type !== 'menu') {
      setIsConfirmingResign(false);
    }
  }, [selection]);

  useEffect(() => {
    setActivityEntries(deriveRoomHistoryEntries(normalizedRoomHistory));
  }, [normalizedRoomHistory]);

  useEffect(() => {
    if (initialReplayAfterStateVersion === undefined || replaySelection !== null) {
      return;
    }

    const initialEntry = deriveRoomHistoryEntries(normalizedRoomHistory).find(
      (entry) => entry.afterStateVersion === initialReplayAfterStateVersion,
    );

    if (!initialEntry) {
      return;
    }

    setReplaySelection({
      afterStateVersion: initialEntry.afterStateVersion,
      beforeStateVersion: initialEntry.beforeStateVersion,
      entryId: initialEntry.id,
      nonce: 0,
    });
    setActivePanel('board');
  }, [initialReplayAfterStateVersion, normalizedRoomHistory, replaySelection]);

  useEffect(() => {
    setActivePanel(initialActivePanel);
  }, [initialActivePanel]);

  useEffect(() => {
    const isFinished = sourceRoom?.game?.status === 'finished';

    if (isFinished && !wasFinishedRef.current) {
      pendingFinishedOverlayRef.current = true;
      setSelection(null);
      setBankSelection([]);
      setDiscardSelection([]);
      setPurchaseSelection(createEmptyPaymentSelection());
    } else if (!isFinished) {
      pendingFinishedOverlayRef.current = false;
      setShowGameComplete(false);
    }

    wasFinishedRef.current = isFinished;
  }, [sourceRoom?.game?.status]);

  useEffect(() => {
    if (
      sourceRoom?.game?.status === 'finished' &&
      pendingFinishedOverlayRef.current &&
      !isPresentingTransition
    ) {
      pendingFinishedOverlayRef.current = false;
      setShowGameComplete(true);
    }
  }, [isPresentingTransition, sourceRoom?.game?.status]);

  useEffect(() => {
    const activePlayerId = game?.players[game.turn.activePlayerIndex]?.identity.id;

    if (!activePlayerId || replaySelection !== null) {
      return;
    }

    const rowNode = playerSummaryRowRefs.current[activePlayerId];

    if (!rowNode) {
      return;
    }

    rowNode.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [game?.turn.activePlayerIndex, game?.turn.kind, game?.turn.round, replaySelection]);

  useEffect(() => {
    if (
      replaySelection &&
      (!roomHistoryByVersion.has(replaySelection.beforeStateVersion) ||
        !roomHistoryByVersion.has(replaySelection.afterStateVersion))
    ) {
      setIsReplayPlaying(false);
      setReplaySelection(null);
    }
  }, [replaySelection, roomHistoryByVersion]);

  useEffect(() => {
    setPurchaseSelection(createEmptyPaymentSelection());
  }, [
    selection?.type === 'market-card' ? selection.cardId : null,
    selection?.type === 'reserved-card' ? selection.cardId : null,
  ]);

  const reservedCards =
    game?.players.find((player) => player.identity.id === currentUserId)?.reservedCards ?? [];
  const selectedBankMove =
    interaction?.legalMoves.find((move) => {
      if (move.type === 'take-distinct') {
        const left = [...move.colors].sort(
          (a, b) => tokenColorOrder.indexOf(a) - tokenColorOrder.indexOf(b),
        );
        const right = [...bankSelection].sort(
          (a, b) => tokenColorOrder.indexOf(a) - tokenColorOrder.indexOf(b),
        );

        return left.length === right.length && left.every((color, index) => color === right[index]);
      }

      return (
        move.type === 'take-pair' &&
        bankSelection.length === 2 &&
        bankSelection.every((color) => color === move.color)
      );
    }) ?? null;
  const activePlayerTokens = game ? game.players[game.turn.activePlayerIndex]!.tokens : null;
  const discardTokenPool = activePlayerTokens ? createTokenList(activePlayerTokens) : [];
  const discardMove =
    interaction?.discardMoves.find((move) => discardMoveMatchesSelection(move, discardSelection)) ?? null;
  const selectedVisibleCard =
    selection?.type === 'market-card'
      ? game
          ? cardTierOrder
              .flatMap((tier) => game.market[`tier${tier}`])
              .find((card) => card.id === selection.cardId) ?? null
          : null
      : null;
  const selectedReservedCard =
    selection?.type === 'reserved-card'
      ? reservedCards.find((card) => card.id === selection.cardId) ?? null
      : null;
  const selectedPlayer =
    selection?.type === 'player'
      ? game?.players.find((player) => player.identity.id === selection.playerId) ?? null
      : null;
  const hiddenMarketCardIds = new Set(
    game
      ? cardTierOrder.flatMap((tier) =>
          game.market[`tier${tier}`]
            .filter((card) =>
              animationFrame.activeTargets.fadePlaceholder.has(animationTargets.marketCard(card.id)),
            )
            .map((card) => card.id),
        )
      : [],
  );
  const activePlayer = game?.players[game.turn.activePlayerIndex] ?? null;
  const viewingPlayer = game?.players.find((player) => player.identity.id === currentUserId) ?? null;
  const noblesById = useMemo(() => {
    const entries = new Map<string, GameState['nobles'][number]>();

    for (const noble of NOBLES) {
      entries.set(noble.id, noble);
    }

    for (const roomState of [room, sourceRoom]) {
      if (!roomState?.game) {
        continue;
      }

      for (const noble of roomState.game.nobles) {
        entries.set(noble.id, noble);
      }

      for (const player of roomState.game.players) {
        for (const noble of player.nobles) {
          entries.set(noble.id, noble);
        }
      }
    }

    return entries;
  }, [room, sourceRoom]);
  const noblesInPlay =
    game
      ? [
          ...game.nobles.map((noble) => ({
            noble,
            ownerDisplayName: null as string | null,
          })),
          ...game.players.flatMap((player) =>
            player.nobles.map((noble) => ({
              noble,
              ownerDisplayName: player.identity.displayName,
            })),
          ),
        ].sort((left, right) => {
          const leftId = Number.parseInt(left.noble.id.replace('noble-', ''), 10);
          const rightId = Number.parseInt(right.noble.id.replace('noble-', ''), 10);

          return leftId - rightId;
        })
      : [];
  const forcedSheet =
    replaySelection !== null
      ? null
      : interaction?.isCurrentUsersTurn && game?.turn.kind === 'discard'
      ? 'discard'
      : interaction?.isCurrentUsersTurn && game?.turn.kind === 'noble'
        ? 'noble'
        : null;
  const actionSheetOpen = forcedSheet !== null || selection !== null;
  const currentTurnCopy =
    game && interaction
      ? turnBannerCopy(game, interaction.isCurrentUsersTurn, interaction.activePlayerName)
      : 'Waiting for room state';
  const replayableEntries = useMemo(
    () =>
      activityEntries
        .filter(
          (entry) =>
            roomHistoryByVersion.has(entry.beforeStateVersion) &&
            roomHistoryByVersion.has(entry.afterStateVersion),
        )
        .sort((left, right) => left.afterStateVersion - right.afterStateVersion),
    [activityEntries, roomHistoryByVersion],
  );
  const replayEntry = replaySelection
    ? replaySelection.entryId === null
      ? null
      : replayableEntries.find((entry) => entry.id === replaySelection.entryId) ?? null
    : null;
  const isInitialReplayState =
    replaySelection !== null &&
    replaySelection.entryId === null &&
    replaySelection.beforeStateVersion === replaySelection.afterStateVersion;
  const replayIndex = replayEntry
    ? replayableEntries.findIndex((entry) => entry.id === replayEntry.id)
    : -1;
  const previousReplayEntry = isInitialReplayState
    ? null
    : replayIndex > 0
      ? replayableEntries[replayIndex - 1] ?? null
      : null;
  const nextReplayEntry = isInitialReplayState
    ? replayableEntries[0] ?? null
    : replayIndex >= 0 && replayIndex < replayableEntries.length - 1
      ? replayableEntries[replayIndex + 1] ?? null
      : null;
  const latestReplayEntry =
    replayableEntries.length > 0 ? replayableEntries[replayableEntries.length - 1] ?? null : null;
  const liveAdvancedWhileReplaying =
    replaySelection !== null &&
    sourceRoom !== null &&
    sourceRoom.stateVersion > replaySelection.afterStateVersion;
  useEffect(() => {
    if (!replaySelection || !isReplayPlaying) {
      replayWasAnimatingRef.current = isPresentingTransition;
      return;
    }

    if (!replayWasAnimatingRef.current && !isPresentingTransition) {
      replayCurrentEntry();
      replayWasAnimatingRef.current = true;
      return;
    }

    if (replayWasAnimatingRef.current && !isPresentingTransition) {
      if (nextReplayEntry) {
        startReplay(nextReplayEntry);
      } else {
        setIsReplayPlaying(false);
      }
    }

    replayWasAnimatingRef.current = isPresentingTransition;
  }, [isPresentingTransition, isReplayPlaying, nextReplayEntry, replaySelection]);
  const reservedPurchaseFlightStep = useMemo(() => {
    if (animationFrame.currentPlan?.kind !== 'purchase-reserved') {
      return null;
    }

    return (
      animationFrame.currentPlan.phases
        .flatMap((phase) => phase.steps)
        .find(
          (step): step is Extract<AnimationStep, { readonly primitive: 'flight-card' }> =>
            step.primitive === 'flight-card' &&
            step.flights.some((flight) => flight.kind === 'purchase-reserved'),
        ) ?? null
    );
  }, [animationFrame.currentPlan]);
  const primaryCardFlight = useMemo(() => {
    const currentPlan = animationFrame.currentPlan;

    if (!currentPlan) {
      return null;
    }

    const expectedKind =
      currentPlan.kind === 'market-purchase'
        ? 'purchase-visible'
        : currentPlan.kind === 'purchase-reserved'
          ? 'purchase-reserved'
          : currentPlan.kind === 'reserve-visible'
            ? 'reserve-visible'
            : currentPlan.kind === 'blind-reserve'
              ? 'reserve-deck'
              : null;

    if (!expectedKind) {
      return null;
    }

    return (
      currentPlan.phases
        .flatMap((phase) => phase.steps)
        .find(
          (
            step,
          ): step is Extract<AnimationStep, { readonly primitive: 'flight-card' }> =>
            step.primitive === 'flight-card' &&
            step.flights.some((flight) => flight.kind === expectedKind),
        )
        ?.flights.find((flight) => flight.kind === expectedKind) ?? null
    );
  }, [animationFrame.currentPlan]);
  const reservedExpandTargetId = Array.from(animationFrame.activeTargets.expandCard).find((targetId) =>
    targetId.startsWith('player:') && targetId.endsWith(':reserved'),
  );
  const reservedExpandPlayerId = reservedExpandTargetId?.split(':')[1] ?? null;
  const reservedExpandCard =
    reservedExpandPlayerId && reservedPurchaseFlightStep
      ? reservedPurchaseFlightStep.flights.find((flight) => flight.kind === 'purchase-reserved')?.card ??
        null
      : null;
  const reservedExpandTier =
    reservedExpandPlayerId && reservedPurchaseFlightStep
      ? reservedPurchaseFlightStep.flights.find((flight) => flight.kind === 'purchase-reserved')?.tier ??
        null
      : null;
  const holdCardTargetId = Array.from(animationFrame.activeTargets.holdCard)[0] ?? null;
  const landCardTargetId = Array.from(animationFrame.activeTargets.landCard)[0] ?? null;
  const flipCardTargetId = reservedExpandTargetId
    ? null
    : Array.from(animationFrame.activeTargets.flipCard).find((targetId) => targetId !== reservedExpandTargetId) ??
      null;
  const overlayTargetId = holdCardTargetId ?? landCardTargetId ?? flipCardTargetId;
  const currentPlanId = animationFrame.currentPlan?.id ?? null;

  if (overlayRectCacheRef.current.planId !== currentPlanId) {
    overlayRectCacheRef.current = {
      planId: currentPlanId,
      rects: new Map(),
    };
  }

  const getStableOverlayRect = (targetId: string | null) => {
    if (!targetId) {
      return null;
    }

    const cachedRect = overlayRectCacheRef.current.rects.get(targetId);

    if (cachedRect) {
      return cachedRect;
    }

    const resolvedRect = resolveTargetRect(targetId);

    if (!resolvedRect) {
      return null;
    }

    overlayRectCacheRef.current.rects.set(targetId, resolvedRect);
    return resolvedRect;
  };

  const reservedExpandRect = getStableOverlayRect(reservedExpandTargetId ?? null);
  const overlayRect = getStableOverlayRect(overlayTargetId);

  const toggleBankColor = (color: TokenColor) => {
    setSelection({ type: 'bank' });
    setBankSelection((current) => {
      const selectedCount = current.filter((candidate) => candidate === color).length;
      const availableCount = game?.bank[color] ?? 0;
      const pairMove = interaction?.pairMovesByColor[color];

      if (selectedCount > 1) {
        const removalIndex = current.lastIndexOf(color);

        return current.filter((_, index) => index !== removalIndex);
      }

      if (selectedCount === 1 && current.length === 1 && pairMove) {
        return [...current, color];
      }

      if (selectedCount > 0) {
        const removalIndex = current.lastIndexOf(color);

        return current.filter((_, index) => index !== removalIndex);
      }

      if (current.length >= 3 || selectedCount >= availableCount) {
        return current;
      }

      const nextSelection = [...current, color];

      return selectionCanBecomeLegalBankMove(nextSelection, interaction) ? nextSelection : current;
    });
  };

  const openBankSelection = (initialColor?: TokenColor) => {
    setSelection({ type: 'bank' });

    if (!initialColor) {
      return;
    }

    if ((game?.bank[initialColor] ?? 0) > 0) {
      setBankSelection([initialColor]);
      return;
    }

    setBankSelection([]);
  };

  const submitAndReset = (move: Move) => {
    onSubmitMove(move);
    setSelection(null);
    setBankSelection([]);
    setDiscardSelection([]);
    setPurchaseSelection(createEmptyPaymentSelection());
  };

  const startReplay = (entry: RoomActivityEntry) => {
    if (
      !roomHistoryByVersion.has(entry.beforeStateVersion) ||
      !roomHistoryByVersion.has(entry.afterStateVersion)
    ) {
      return;
    }

    setSelection(null);
    setBankSelection([]);
    setDiscardSelection([]);
    setPurchaseSelection(createEmptyPaymentSelection());
    setShowGameComplete(false);
    setActivePanel('board');
    setReplaySelection({
      afterStateVersion: entry.afterStateVersion,
      beforeStateVersion: entry.beforeStateVersion,
      entryId: entry.id,
      nonce: 0,
    });
  };

  const selectReplayEntry = (entry: RoomActivityEntry) => {
    setIsReplayPlaying(false);
    startReplay(entry);
  };

  const replayCurrentEntry = () => {
    if (!replaySelection) {
      return;
    }

    setShowGameComplete(false);
    setReplaySelection((current) =>
      current
        ? {
            ...current,
            nonce: current.nonce + 1,
          }
        : current,
    );
  };

  const stopReplay = () => {
    setIsReplayPlaying(false);
    setReplaySelection(null);
  };

  const selectInitialReplayState = () => {
    const initialRoom = normalizedRoomHistory[0];

    if (!initialRoom) {
      return;
    }

    setIsReplayPlaying(false);
    setSelection(null);
    setBankSelection([]);
    setDiscardSelection([]);
    setPurchaseSelection(createEmptyPaymentSelection());
    setShowGameComplete(false);
    setActivePanel('board');
    setReplaySelection({
      afterStateVersion: initialRoom.stateVersion,
      beforeStateVersion: initialRoom.stateVersion,
      entryId: null,
      nonce: 0,
    });
  };

  const renderBoardPanel = () => {
    if (!game || !interaction) {
      return null;
    }

    return (
      <>
        <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
          <button
            className={`flex w-full items-center gap-2 rounded-[0.8rem] text-left transition ${
              selection?.type === 'bank' ? 'bg-white/5' : ''
            } ${
              interaction.isCurrentUsersTurn && game.turn.kind === 'main-action' && canOpenUI
                ? 'active:scale-[0.995]'
                : ''
            }`}
            disabled={
              !interaction.isCurrentUsersTurn ||
              game.turn.kind !== 'main-action' ||
              !canOpenUI
            }
            onClick={() => openBankSelection()}
            type="button"
          >
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Bank</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {gemOrder.map((color) => (
                <span
                  key={`bank-${color}`}
                  ref={(node) => {
                    targetNodeRefs.current[animationTargets.bankChip(color)] = node;
                  }}
                  className={`${color === 'gold' ? 'ml-2' : ''} ${
                    sourceChipBulges.bankColors.includes(color) ? 'receive-bulge' : ''
                  } ${
                    animationState.changedBankColors.includes(color) ? 'receive-bulge' : ''
                  }`}
                >
                  <GemPip color={color} count={game.bank[color]} size="sm" />
                </span>
              ))}
            </div>
          </button>
        </section>

        <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
          <p className="px-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">Market</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {cardTierOrder.map((tier) => {
              const tierKey = `tier${tier}` as const;

              return (
                <section key={`tier-${tier}`} className="px-0.5">
                  <div className="grid grid-cols-5 gap-1.5">
                    <div
                      ref={(node) => {
                        targetNodeRefs.current[animationTargets.deck(tier)] = node;
                      }}
                      className={animationState.changedDeckTiers.includes(tier) ? 'board-piece-bounce' : ''}
                    >
                      <DeckCard
                        disabled={
                          !interaction.isCurrentUsersTurn ||
                          game.turn.kind !== 'main-action' ||
                          !canOpenUI
                        }
                        isSelected={selection?.type === 'deck' && selection.tier === tier}
                        onPress={() => setSelection({ type: 'deck', tier })}
                        remainingCount={game.decks[tierKey].length}
                        size="compact"
                        tier={tier}
                      />
                    </div>
                    {game.market[tierKey].map((card) => (
                      <div
                        key={card.id}
                        ref={(node) => {
                          targetNodeRefs.current[animationTargets.marketCard(card.id)] = node;
                        }}
                        className={animationState.changedMarketCardIds.includes(card.id) ? 'board-piece-pop' : ''}
                      >
                        {hiddenMarketCardIds.has(card.id) ? (
                          <div className="aspect-[5/7] w-full rounded-[1.05rem] border border-dashed border-white/10 bg-white/[0.03]" />
                        ) : (
                          <SplendorCard
                            card={card}
                            disabled={!canOpenUI}
                            isSelected={selection?.type === 'market-card' && selection.cardId === card.id}
                            onPress={() => setSelection({ type: 'market-card', cardId: card.id })}
                            size="compact"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </>
    );
  };

  const renderNoblesPanel = () => {
    if (!game) {
      return null;
    }

    return (
      <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
        <p className="px-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">Nobles</p>
        <div className="mt-2 grid grid-cols-3 gap-2 px-0.5">
          {noblesInPlay.map(({ noble, ownerDisplayName }) => (
            <div
              key={`noble-${noble.id}`}
              className={`relative ${ownerDisplayName ? 'opacity-45 saturate-50' : ''}`}
            >
              <NobleTile noble={noble} size="compact" />
              {ownerDisplayName ? (
                <span className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-stone-950/88 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-100 ring-1 ring-white/10">
                  {ownerDisplayName[0]}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderLogPanel = () => (
    <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
      <p className="px-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">Log</p>
      <div className="mt-2 space-y-1.5">
        {activityEntries.length > 0 ? (
          activityEntries.map((entry) => (
            <button
              key={entry.id}
              className={`log-entry flex w-full items-center justify-between gap-3 rounded-[0.9rem] border px-3 py-2 text-left text-sm ${
                entry.accent === 'amber'
                  ? 'border-amber-300/18 bg-amber-300/7 text-amber-50'
                  : entry.accent === 'emerald'
                    ? 'border-emerald-300/18 bg-emerald-300/7 text-emerald-50'
                    : 'border-sky-300/18 bg-sky-300/7 text-sky-50'
              } ${entry.stateVersion === room?.stateVersion ? 'log-entry-new' : ''} ${
                replaySelection?.entryId === entry.id ? 'ring-2 ring-amber-300/35' : ''
              }`}
              disabled={
                !roomHistoryByVersion.has(entry.beforeStateVersion) ||
                !roomHistoryByVersion.has(entry.afterStateVersion)
              }
              onClick={() => startReplay(entry)}
              type="button"
            >
              <span className="min-w-0 flex-1">{entry.message}</span>
              <span className="shrink-0 rounded-full border border-white/10 bg-black/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-200/90 disabled:opacity-40">
                Replay
              </span>
            </button>
          ))
        ) : (
          <p className="rounded-[0.9rem] border border-white/8 bg-white/4 px-3 py-3 text-sm text-stone-400">
            No actions yet.
          </p>
        )}
      </div>
    </section>
  );

  const renderPurchaseSheet = (
    card: Card,
    source: 'market' | 'reserved',
  ) => {
    const purchaseMove =
      source === 'market'
        ? interaction?.purchaseVisibleByCardId[card.id]
        : interaction?.purchaseReservedByCardId[card.id];
    const reserveMove =
      source === 'market' ? interaction?.reserveVisibleByCardId[card.id] : null;
    const isActionable =
      interaction?.isCurrentUsersTurn &&
      game?.turn.kind === 'main-action' &&
      canSubmitRealtimeMoves;
    const autoPayment = activePlayer ? getAutoPayment(activePlayer, card) : null;
    const viewerAutoPayment = viewingPlayer ? getAutoPayment(viewingPlayer, card) : null;
    const effectiveCost = viewingPlayer ? getCardEffectiveCost(viewingPlayer, card) : createEmptyPaymentSelection().tokens;
    const manualSelectedCount = totalSelectedPayment(purchaseSelection);
    const manualPaymentValid =
      activePlayer !== null && isValidPaymentForCard(activePlayer, card, purchaseSelection);
    const totalEffectiveCost = tokenColorOrder.reduce((sum, color) => sum + effectiveCost[color], 0);
    const goldNeeded = viewerAutoPayment?.gold ?? 0;

    const addPaymentToken = (color: GemColor) => {
      if (!activePlayer) {
        return;
      }

      if (totalSelectedPayment(purchaseSelection) >= totalEffectiveCost) {
        return;
      }

      if (color === 'gold') {
        if (purchaseSelection.gold >= activePlayer.tokens.gold) {
          return;
        }

        setPurchaseSelection((current) => ({
          ...current,
          gold: current.gold + 1,
        }));
        return;
      }

      if (
        purchaseSelection.tokens[color] >= activePlayer.tokens[color] ||
        purchaseSelection.tokens[color] >= effectiveCost[color]
      ) {
        return;
      }

      setPurchaseSelection((current) => ({
        ...current,
        tokens: {
          ...current.tokens,
          [color]: current.tokens[color] + 1,
        },
      }));
    };

    const removePaymentToken = (color: GemColor) => {
      if (color === 'gold') {
        setPurchaseSelection((current) => ({
          ...current,
          gold: Math.max(0, current.gold - 1),
        }));
        return;
      }

      setPurchaseSelection((current) => ({
        ...current,
        tokens: {
          ...current.tokens,
          [color]: Math.max(0, current.tokens[color] - 1),
        },
      }));
    };

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-24 shrink-0">
            <SplendorCard card={card} size="compact" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <section className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Your effective cost</p>
              <div className="flex flex-wrap gap-2">
                {tokenColorOrder
                  .filter((color) => effectiveCost[color] > 0)
                  .map((color) => (
                    <GemPip
                      key={`effective-cost-${card.id}-${color}`}
                      color={color}
                      count={effectiveCost[color]}
                      size="sm"
                    />
                  ))}
                {goldNeeded > 0 ? (
                  <GemPip
                    key={`effective-cost-${card.id}-gold`}
                    color="gold"
                    count={goldNeeded}
                    size="sm"
                  />
                ) : null}
                {totalEffectiveCost === 0 && goldNeeded === 0 ? (
                  <span className="text-sm text-stone-400">Free with discounts</span>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Your chips</p>
                <button
                  className="text-[10px] uppercase tracking-[0.18em] text-stone-500 transition hover:text-stone-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-stone-500"
                  disabled={manualSelectedCount === 0}
                  onClick={() => setPurchaseSelection(createEmptyPaymentSelection())}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {gemOrder.map((color) => {
                  const selectedCount =
                    color === 'gold'
                      ? purchaseSelection.gold
                      : purchaseSelection.tokens[color as TokenColor];
                  const availableCount = activePlayer?.tokens[color] ?? 0;
                  const disabled =
                    !isActionable ||
                    availableCount === 0 ||
                    manualSelectedCount >= totalEffectiveCost ||
                    (color === 'gold'
                      ? purchaseSelection.gold >= availableCount
                      : effectiveCost[color as TokenColor] === 0 ||
                        purchaseSelection.tokens[color as TokenColor] >= availableCount ||
                        purchaseSelection.tokens[color as TokenColor] >=
                          effectiveCost[color as TokenColor]);

                  return (
                    <button
                      key={`payment-chip-${card.id}-${color}`}
                      className={`relative rounded-full ${
                        selectedCount > 0 && color !== 'gold'
                          ? `ring-4 ${tokenRingStyles[color as TokenColor]}`
                          : selectedCount > 0
                            ? 'ring-4 ring-amber-300/50'
                            : ''
                      }`}
                      disabled={disabled}
                      onClick={() => addPaymentToken(color)}
                      type="button"
                    >
                      <GemPip color={color} count={availableCount} size="sm" />
                      {selectedCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-950 px-1 text-[10px] font-semibold text-stone-100 ring-1 ring-white/10">
                          {selectedCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Paying</p>
              <div className="min-h-11 rounded-[1rem] border border-white/8 bg-white/4 p-2">
                <div className="flex flex-wrap gap-2">
                  {gemOrder
                    .filter((color) =>
                      color === 'gold'
                        ? purchaseSelection.gold > 0
                        : purchaseSelection.tokens[color as TokenColor] > 0,
                    )
                    .map((color) => {
                      const count =
                        color === 'gold'
                          ? purchaseSelection.gold
                          : purchaseSelection.tokens[color as TokenColor];

                      return (
                        <button
                          key={`payment-selected-${card.id}-${color}`}
                          className="rounded-full ring-2 ring-amber-300/40"
                          onClick={() => removePaymentToken(color)}
                          type="button"
                        >
                          <GemPip color={color} count={count} size="sm" />
                        </button>
                      );
                    })}
                  {manualSelectedCount === 0 ? (
                    <p className="text-sm text-stone-500">Auto-buy will spend the fewest gold.</p>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
        <div className="grid gap-3">
          <button
            className={primaryButtonClass}
            disabled={
              !isActionable ||
              (manualSelectedCount === 0 ? !purchaseMove || !autoPayment : !manualPaymentValid)
            }
            onClick={() => {
              if (manualSelectedCount > 0) {
                submitAndReset({
                  type: source === 'market' ? 'purchase-visible' : 'purchase-reserved',
                  cardId: card.id,
                  payment: purchaseSelection,
                });
                return;
              }

              if (purchaseMove && autoPayment) {
                submitAndReset({
                  type: source === 'market' ? 'purchase-visible' : 'purchase-reserved',
                  cardId: card.id,
                  payment: autoPayment,
                });
              }
            }}
            type="button"
          >
            {manualSelectedCount > 0 ? 'Buy' : 'Auto-buy'}
          </button>
          {source === 'market' ? (
            <button
              className={subtleButtonClass}
              disabled={!reserveMove || !isActionable}
              onClick={() => {
                if (reserveMove) {
                  submitAndReset(reserveMove);
                }
              }}
              type="button"
            >
              Reserve
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderDeckSheet = (tier: CardTier) => {
    const reserveMove = interaction?.deckMovesByTier[tier];
    const goldAvailable = (game?.bank.gold ?? 0) > 0;
    const isActionable =
      interaction?.isCurrentUsersTurn &&
      game?.turn.kind === 'main-action' &&
      canSubmitRealtimeMoves;

    return (
      <div className="space-y-3">
        {reserveMove && isActionable ? (
          <>
            <button
              className={primaryButtonClass}
              onClick={() => submitAndReset(reserveMove)}
              type="button"
            >
              Reserve
            </button>
            {!goldAvailable ? (
              <p className="text-sm text-stone-400">No gold token available from the bank.</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-6 text-stone-300">You cannot reserve from this deck right now.</p>
        )}
      </div>
    );
  };

  const renderBankSheet = () => (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-stone-300">
        Tap bank tokens to build your pick. Tap the same color twice to take a pair when allowed.
      </p>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Selected {bankSelection.length}/3</p>
        <div className="flex flex-wrap gap-2.5">
          {tokenColorOrder.map((color) => {
            const selectedCount = countTokenSelection(bankSelection)[color];

            return (
              <button
                key={`bank-select-${color}`}
                className={`relative rounded-full px-1.5 py-1 ${selectedCount > 0 ? `outline-4 outline-offset-2 ${tokenRingStyles[color]}` : ''}`}
                disabled={(game?.bank[color] ?? 0) === 0 || !canSubmitRealtimeMoves}
                onClick={() => toggleBankColor(color)}
                type="button"
              >
                <GemPip color={color} count={game?.bank[color] ?? 0} />
                {selectedCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-950 px-1 text-[10px] font-semibold text-stone-100 ring-1 ring-white/10">
                    {selectedCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <button
        className={primaryButtonClass}
        disabled={!selectedBankMove || !canSubmitRealtimeMoves}
        onClick={() => {
          if (selectedBankMove) {
            submitAndReset(selectedBankMove);
          }
        }}
        type="button"
      >
        Take {bankSelection.length}
      </button>
    </div>
  );

  const renderDiscardSheet = () => {
    const requiredCount = game?.turn.kind === 'discard' ? game.turn.requiredCount : 0;
    const remainingTokens = discardSelection.reduce<readonly GemColor[]>((pool, color) => {
      const tokenIndex = pool.indexOf(color);

      if (tokenIndex === -1) {
        return pool;
      }

      return pool.filter((_, index) => index !== tokenIndex);
    }, discardTokenPool);
    const remainingCounts = countGemSelection(remainingTokens);
    const discardCounts = countGemSelection(discardSelection);

    return (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-stone-300">
          Tap tokens to move them into the discard pile. Tap selected tokens again to undo. Submit once you have exactly {requiredCount}.
        </p>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Your tokens</p>
            <span className="text-xs uppercase tracking-[0.22em] text-stone-500">
              {Math.max(requiredCount - discardSelection.length, 0)} left
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {gemOrder
              .filter((color) => remainingCounts[color] > 0)
              .map((color) => (
                <button
                  key={`available-${color}`}
                  className="rounded-full"
                  disabled={discardSelection.length >= requiredCount}
                  onClick={() => {
                    if (discardSelection.length < requiredCount) {
                      setDiscardSelection((current) => [...current, color]);
                    }
                  }}
                  type="button"
                >
                  <GemPip color={color} count={remainingCounts[color]} />
                </button>
              ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">To discard</p>
            <span className="text-xs uppercase tracking-[0.22em] text-stone-500">
              {discardSelection.length}/{requiredCount}
            </span>
          </div>
          <div className="min-h-14 rounded-[1.2rem] border border-white/8 bg-white/3 p-3">
            <div className="flex flex-wrap gap-2">
              {gemOrder
                .filter((color) => discardCounts[color] > 0)
                .map((color) => (
                  <button
                    key={`discard-pile-${color}`}
                    className="rounded-full ring-2 ring-amber-300/40"
                    onClick={() => {
                      const tokenIndex = discardSelection.indexOf(color);

                      if (tokenIndex !== -1) {
                        setDiscardSelection((current) =>
                          current.filter((_, currentIndex) => currentIndex !== tokenIndex),
                        );
                      }
                    }}
                    type="button"
                  >
                    <GemPip color={color} count={discardCounts[color]} />
                  </button>
                ))}
              {discardSelection.length === 0 ? (
                <div className="inline-flex h-9 items-center">
                  <p className="text-sm text-stone-500">No tokens selected yet.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <button
          className={primaryButtonClass}
          disabled={discardSelection.length !== requiredCount || !discardMove || !canSubmitRealtimeMoves}
          onClick={() => {
            if (discardMove) {
              submitAndReset(discardMove);
            }
          }}
          type="button"
        >
          {discardSelection.length === requiredCount ? 'Discard selected tokens' : `Select ${requiredCount} tokens`}
        </button>
      </div>
    );
  };

  const renderNobleSheet = () => (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-stone-300">Your purchase unlocked a noble. Claim one or skip the visit.</p>
      <div className="grid grid-cols-3 gap-2">
        {game?.nobles.map((noble) => {
          const claimMove = interaction?.claimNobleMoves.find((move) => move.nobleId === noble.id);

          return (
            <NobleTile
              key={`noble-${noble.id}`}
              isSelected={Boolean(claimMove)}
              noble={noble}
              size="compact"
              {...(claimMove && canSubmitRealtimeMoves
                ? {
                    onPress: () => {
                      submitAndReset(claimMove);
                    },
                  }
                : {})}
            />
          );
        })}
      </div>
      {interaction?.skipNobleMove ? (
        <button
          className={subtleButtonClass}
          disabled={!canSubmitRealtimeMoves}
          onClick={() => {
            if (interaction.skipNobleMove) {
              submitAndReset(interaction.skipNobleMove);
            }
          }}
          type="button"
        >
          Skip noble
        </button>
      ) : null}
    </div>
  );

  const renderPlayerSheet = (player: GameState['players'][number]) => {
    const playerSummary = playerSummaries.find((summary) => summary.id === player.identity.id)!;
    const canViewReserved = player.identity.id === currentUserId;

    return (
      <div className="space-y-4">
        <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-3">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Tableau cards</p>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {player.purchasedCards.length > 0 ? (
              player.purchasedCards.map((card) => (
                <SplendorCard key={`tableau-${player.identity.id}-${card.id}`} card={card} size="tiny" />
              ))
            ) : (
              <p className="col-span-5 text-sm text-stone-500">No purchased cards yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-3">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Reserved cards</p>
          <div className="mt-3">
            {canViewReserved ? (
              <div className="grid grid-cols-5 gap-1.5">
                {player.reservedCards.length > 0 ? (
                  player.reservedCards.map((card) => (
                    <SplendorCard
                      key={`reserved-detail-${card.id}`}
                      card={card}
                      disabled={!canOpenUI}
                      onPress={() => setSelection({ type: 'reserved-card', cardId: card.id })}
                      size="tiny"
                    />
                  ))
                ) : (
                  <p className="col-span-5 text-sm text-stone-500">No reserved cards.</p>
                )}
              </div>
            ) : (
              <HiddenReservedCards tiers={playerSummary.reservedTiers} />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMenuSheet = () => {
    const currentPlayer = game?.players.find((p) => p.identity.id === currentUserId);
    const canResign =
      sourceRoom?.status === 'in_progress' &&
      joined &&
      !currentPlayer?.resigned &&
      game?.status === 'in_progress';

    return (
      <div className="space-y-4">
        <div className="grid gap-2">
          <Link
            className="rounded-[1rem] border border-white/8 bg-white/4 px-4 py-3 text-sm font-medium text-stone-100 transition hover:border-white/15 hover:bg-white/6"
            to="/"
          >
            Back to lobby
          </Link>
        </div>

        <div className="rounded-[1rem] border border-white/8 bg-white/4 p-3 text-sm text-stone-300">
          Room {room?.id} • v{room?.stateVersion}
        </div>

        {room ? (
          <div className="rounded-[1rem] border border-white/8 bg-white/4 p-3 text-sm text-stone-300">
            {room.config.targetScore} pts • {room.config.seatCount} players
          </div>
        ) : null}

        {canResign ? (
          isConfirmingResign ? (
            <div className="rounded-[1rem] border border-rose-500/25 bg-rose-500/8 p-3">
              <p className="mb-3 text-sm text-rose-200">
                Resign from this game? In multiplayer, the game continues without you.
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-full bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                  onClick={() => {
                    setIsConfirmingResign(false);
                    setSelection(null);
                    onResign();
                  }}
                  type="button"
                >
                  Confirm resign
                </button>
                <button
                  className={subtleButtonClass}
                  onClick={() => setIsConfirmingResign(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="rounded-[1rem] border border-rose-500/20 bg-rose-500/6 px-4 py-3 text-sm font-medium text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/10"
              onClick={() => setIsConfirmingResign(true)}
              type="button"
            >
              Resign
            </button>
          )
        ) : null}

        <button
          className={subtleButtonClass}
          onClick={onLogout}
          type="button"
        >
          Log out
        </button>
      </div>
    );
  };

  const renderActionSheetContent = () => {
    if (!game || !interaction) {
      return null;
    }

    if (forcedSheet === 'discard') {
      return {
        title: 'Discard tokens',
        subtitle: `Discard ${game.turn.kind === 'discard' ? game.turn.requiredCount : 0} to complete the turn.`,
        content: renderDiscardSheet(),
      };
    }

    if (forcedSheet === 'noble') {
      return {
        title: 'Choose noble',
        subtitle: 'Resolve the noble step before the turn can pass.',
        content: renderNobleSheet(),
      };
    }

    if (selection?.type === 'player' && selectedPlayer) {
      return {
        eyebrow: 'Player',
        title: selectedPlayer.identity.displayName,
        content: renderPlayerSheet(selectedPlayer),
      };
    }

    if (selection?.type === 'menu') {
      return {
        eyebrow: 'Room',
        title: 'Menu',
        content: renderMenuSheet(),
      };
    }

    if (selection?.type === 'market-card' && selectedVisibleCard) {
      return {
        eyebrow: 'Market',
        title: 'Buy or reserve',
        content: renderPurchaseSheet(selectedVisibleCard, 'market'),
      };
    }

    if (selection?.type === 'reserved-card' && selectedReservedCard) {
      return {
        eyebrow: 'Reserved card',
        title: 'Buy reserved card',
        content: renderPurchaseSheet(selectedReservedCard, 'reserved'),
      };
    }

    if (selection?.type === 'deck') {
      return {
        title: `Blind reserve: tier ${selection.tier}`,
        content: renderDeckSheet(selection.tier),
      };
    }

    if (selection?.type === 'bank') {
      return {
        title: 'Take gems',
        content: renderBankSheet(),
      };
    }

    return null;
  };

  const actionSheetContent = renderActionSheetContent();

  return (
    <main
      className="h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_28%),linear-gradient(180deg,_#1e140f,_#090d15)] text-stone-100"
      style={animationCssVars}
    >
      <div className="mx-auto flex h-full max-w-md flex-col gap-2 overflow-hidden px-2 py-2">
        <header className="sticky top-0 z-30 rounded-[1rem] border border-white/10 bg-stone-950/90 px-2.5 py-2 shadow-[0_14px_36px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="truncate text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {room ? `Room ${roomCodeLabel(roomId)}` : 'Loading'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">•</span>
                <span className="text-sm font-semibold text-amber-50">{statusLabel(room)}</span>
              </div>
              <p className="truncate text-[12px] leading-4 text-stone-300">{currentTurnCopy}</p>
            </div>
            {sourceRoom?.status === 'in_progress' && !isSocketConnected ? (
              <span className="rounded-full border border-sky-300/20 bg-sky-300/8 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-100">
                Connecting
              </span>
            ) : null}
            {replaySelection === null && latestReplayEntry ? (
              <button
                aria-label="Enter replay mode"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/18 bg-sky-950/26 text-sky-50 transition hover:bg-sky-950/40"
                onClick={() => selectReplayEntry(latestReplayEntry)}
                type="button"
              >
                <Undo aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
            <button
              className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-stone-100 transition hover:border-white/20 hover:bg-white/8"
              onClick={() => setSelection({ type: 'menu' })}
              type="button"
            >
              Menu
            </button>
            {game?.status === 'finished' && !showGameComplete ? (
              <button
                className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-[11px] font-medium text-amber-50 transition hover:border-amber-300/30 hover:bg-amber-300/12"
                onClick={() => setShowGameComplete(true)}
                type="button"
              >
                Score
              </button>
            ) : null}
          </div>
          {replaySelection ? (
            <div className="mt-2 flex items-center gap-2 rounded-[0.9rem] border border-sky-300/18 bg-sky-300/8 px-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-[0.16em] text-sky-200/80">Replay</p>
                <p className="truncate text-[11px] text-sky-50">
                  {isInitialReplayState ? 'Initial board' : `${replayIndex + 1} / ${replayableEntries.length}`}
                  {liveAdvancedWhileReplaying && sourceRoom ? ` • Live v${sourceRoom.stateVersion}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ReplayIconButton
                  disabled={isInitialReplayState}
                  label="Rewind to beginning"
                  onClick={selectInitialReplayState}
                >
                  <ChevronFirst aria-hidden="true" className="h-4 w-4" />
                </ReplayIconButton>
                <ReplayIconButton
                  disabled={!previousReplayEntry}
                  label="Previous step"
                  onClick={() => {
                    if (previousReplayEntry) {
                      selectReplayEntry(previousReplayEntry);
                    }
                  }}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </ReplayIconButton>
                <ReplayIconButton
                  disabled={replayableEntries.length === 0}
                  label={isReplayPlaying ? 'Pause replay' : 'Play replay'}
                  onClick={() => setIsReplayPlaying((current) => !current)}
                >
                  {isReplayPlaying ? (
                    <Pause aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                  )}
                </ReplayIconButton>
                <ReplayIconButton
                  disabled={!nextReplayEntry}
                  label="Next step"
                  onClick={() => {
                    if (nextReplayEntry) {
                      selectReplayEntry(nextReplayEntry);
                    }
                  }}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </ReplayIconButton>
                <ReplayIconButton label="Jump to live" onClick={stopReplay}>
                  <ChevronLast aria-hidden="true" className="h-4 w-4" />
                </ReplayIconButton>
              </div>
            </div>
          ) : null}
          {(canJoin || canStart) ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {canJoin ? (
                <button className={primaryButtonClass} disabled={isWorking} onClick={onJoinRoom} type="button">
                  Join
                </button>
              ) : null}
              {canStart ? (
                <button className={primaryButtonClass} disabled={isWorking} onClick={onStartGame} type="button">
                  Start
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {errorMessage ? (
          <div className="rounded-[1rem] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {room ? (
          <>
            {game ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                {!(showGameComplete && game.status === 'finished') ? (
                  <section className="min-h-0 flex-1 overflow-hidden rounded-[1rem] border border-white/10 bg-stone-950/72 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                    <div ref={playerSummaryContainerRef} className="h-full overflow-y-auto p-2">
                      <div className="space-y-1.5">
                        {playerSummaries.map((player) => (
                          <PlayerSummaryRow
                            chipTargetRefByColor={gemOrder.reduce<
                              Partial<Record<GemColor, (node: HTMLSpanElement | null) => void>>
                            >((result, color) => {
                              return {
                                ...result,
                                [color]: (node: HTMLSpanElement | null) => {
                                  targetNodeRefs.current[animationTargets.playerChip(player.id, color)] = node;
                                },
                              };
                            }, {})}
                            key={`summary-${player.id}`}
                            currentUserId={currentUserId}
                            isRecentlyUpdated={animationState.changedPlayerIds.includes(player.id)}
                            nobleTargetRef={(node) => {
                              targetNodeRefs.current[animationTargets.playerNobles(player.id)] = node;
                            }}
                            playerAnimation={playerAnimations[player.id] ?? emptyPlayerReceiveAnimation}
                            sourceChipBulges={sourceChipBulges.playerColorsById[player.id] ?? []}
                            onPress={() => {
                              if (game) {
                                setSelection({ type: 'player', playerId: player.id });
                              }
                            }}
                            player={player}
                            rowRef={(node) => {
                              playerSummaryRowRefs.current[player.id] = node;
                            }}
                            room={room}
                            reservedTargetRef={(node) => {
                              targetNodeRefs.current[animationTargets.playerReserved(player.id)] = node;
                            }}
                            tableauTargetRef={(node) => {
                              targetNodeRefs.current[animationTargets.playerTableau(player.id)] = node;
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                {game && showGameComplete && game.status === 'finished' ? (
                  <GameCompleteScreen
                    game={game}
                    onViewBoard={() => setShowGameComplete(false)}
                    playerSummaries={playerSummaries}
                  />
                ) : (
                  <div className="shrink-0 space-y-2">
                    <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                      <div className="grid grid-cols-3 gap-1">
                        {(['board', 'nobles', 'log'] as const).map((panel) => (
                          <button
                            key={`panel-${panel}`}
                            className={`${panelToggleButtonClass} ${
                              activePanel === panel
                                ? 'bg-amber-300 text-stone-950'
                                : 'bg-white/4 text-stone-300 hover:bg-white/8'
                            }`}
                            onClick={() => setActivePanel(panel)}
                            type="button"
                          >
                            {panel === 'board' ? 'Board' : panel === 'nobles' ? 'Nobles' : 'Log'}
                          </button>
                        ))}
                      </div>
                    </section>

                    {activePanel === 'board'
                      ? renderBoardPanel()
                      : activePanel === 'nobles'
                        ? renderNoblesPanel()
                        : renderLogPanel()}
                  </div>
                )}
              </div>
            ) : (
              <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-3 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                <div className="space-y-2">
                  {room.participants.map((participant) => (
                    <div
                      key={`waiting-participant-${participant.userId}`}
                      className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-white/8 bg-white/4 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            (sourceRoom?.connectedUserIds ?? room.connectedUserIds).includes(participant.userId) ||
                            (participant.userId === currentUserId && isSocketConnected)
                              ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
                              : 'bg-rose-400/90 shadow-[0_0_10px_rgba(251,113,133,0.22)]'
                          }`}
                        />
                        <span className="text-sm text-stone-200">{participant.displayName}</span>
                      </div>
                      {room.hostUserId === currentUserId && participant.userId !== currentUserId ? (
                        <button
                          className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[11px] font-medium text-rose-100 transition hover:border-rose-300/30 hover:bg-rose-400/16"
                          disabled={isWorking}
                          onClick={() => onBootParticipant(participant.userId)}
                          type="button"
                        >
                          Boot
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-3 text-sm text-stone-300 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
            Loading room state from the server.
          </section>
        )}
      </div>

      {displayedChipFlights.map((flight) => (
        <span
          key={flight.id}
          aria-hidden="true"
          className="chip-flight fixed z-50 inline-flex items-center justify-center"
          style={
            {
              ...(flight.delayMs ? { animationDelay: `${flight.delayMs}ms` } : {}),
              ...(flight.durationMs ? { animationDuration: `${flight.durationMs}ms` } : {}),
              left: `${flight.fromX}px`,
              top: `${flight.fromY}px`,
              '--chip-dx': `${flight.toX - flight.fromX + flight.laneOffsetX}px`,
              '--chip-dy': `${flight.toY - flight.fromY + flight.laneOffsetY}px`,
            } as CSSProperties
          }
        >
          <span
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-bold ring-1 ring-white/18 shadow-[0_10px_22px_rgba(0,0,0,0.34)] ${floatingChipStyles[flight.color]}`}
          >
            {flight.count}
          </span>
        </span>
      ))}

      {displayedShortChipFlights.map((flight) => (
        <span
          key={`short-${flight.id}`}
          aria-hidden="true"
          className="chip-flight-short fixed z-50 inline-flex items-center justify-center"
          style={
            {
              ...(flight.delayMs ? { animationDelay: `${flight.delayMs}ms` } : {}),
              ...(flight.durationMs ? { animationDuration: `${flight.durationMs}ms` } : {}),
              left: `${flight.fromX}px`,
              top: `${flight.fromY}px`,
              '--chip-dx': `${flight.toX - flight.fromX + flight.laneOffsetX}px`,
              '--chip-dy': `${flight.toY - flight.fromY + flight.laneOffsetY}px`,
            } as CSSProperties
          }
        >
          <span
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-bold ring-1 ring-white/18 shadow-[0_10px_22px_rgba(0,0,0,0.34)] ${floatingChipStyles[flight.color]}`}
          >
            {flight.count}
          </span>
        </span>
      ))}

      {reservedExpandRect && reservedExpandCard && reservedExpandTier ? (
        <div
          aria-hidden="true"
          className="fixed z-50 pointer-events-none w-[4.6rem] card-expand-only card-overlay-pose"
          style={
            {
              left: `${reservedExpandRect.left}px`,
              top: `${reservedExpandRect.top}px`,
            } as CSSProperties
          }
        >
          <div className="card-flip-reveal-static-inner relative aspect-[5/7] w-full">
            <div className="card-flight-face absolute inset-0">
              <SplendorCard card={reservedExpandCard} size="compact" />
            </div>
            <div
              className="card-flight-face absolute inset-0"
              style={{ transform: 'rotateY(180deg)' }}
            >
              <DeckCard hideCount remainingCount={0} size="compact" tier={reservedExpandTier} />
            </div>
          </div>
        </div>
      ) : null}

      {overlayRect && primaryCardFlight ? (
        <div
          aria-hidden="true"
          className={`fixed z-50 pointer-events-none w-[4.6rem] ${
            holdCardTargetId
              ? 'card-hold'
              : landCardTargetId
                ? 'card-land card-overlay-pose'
                : flipCardTargetId
                  ? 'card-flip-only card-overlay-pose'
                  : ''
          }`}
          style={
            {
              left: `${overlayRect.left}px`,
              top: `${overlayRect.top}px`,
            } as CSSProperties
          }
        >
          {flipCardTargetId &&
          primaryCardFlight.kind === 'reserve-visible' &&
          primaryCardFlight.card &&
          primaryCardFlight.tier ? (
            <div className="card-flip-only-inner relative aspect-[5/7] w-full">
              <div className="card-flight-face absolute inset-0">
                <SplendorCard card={primaryCardFlight.card} size="compact" />
              </div>
              <div
                className="card-flight-face absolute inset-0"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <DeckCard hideCount remainingCount={0} size="compact" tier={primaryCardFlight.tier} />
              </div>
            </div>
          ) : flipCardTargetId &&
            primaryCardFlight.kind === 'purchase-reserved' &&
            primaryCardFlight.card &&
            primaryCardFlight.tier ? (
            <div className="card-flip-reveal-only-inner relative aspect-[5/7] w-full">
              <div className="card-flight-face absolute inset-0">
                <SplendorCard card={primaryCardFlight.card} size="compact" />
              </div>
              <div
                className="card-flight-face absolute inset-0"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <DeckCard hideCount remainingCount={0} size="compact" tier={primaryCardFlight.tier} />
              </div>
            </div>
          ) : primaryCardFlight.kind === 'reserve-deck' && primaryCardFlight.tier ? (
            <DeckCard hideCount remainingCount={0} size="compact" tier={primaryCardFlight.tier} />
          ) : primaryCardFlight.kind === 'reserve-visible' && primaryCardFlight.tier ? (
            holdCardTargetId ? (
              <SplendorCard card={primaryCardFlight.card!} size="compact" />
            ) : (
              <DeckCard hideCount remainingCount={0} size="compact" tier={primaryCardFlight.tier} />
            )
          ) : primaryCardFlight.card ? (
            <SplendorCard card={primaryCardFlight.card} size="compact" />
          ) : null}
        </div>
      ) : null}

      {cardFlights.map((flight) => (
        <div
          key={flight.id}
          aria-hidden="true"
          className={`fixed z-50 pointer-events-none ${
            flight.kind === 'noble' ? 'noble-flight w-[4.25rem]' : 'card-flight w-[4.6rem]'
          }`}
          style={
            {
              ...(flight.delayMs ? { animationDelay: `${flight.delayMs}ms` } : {}),
              ...(flight.durationMs ? { animationDuration: `${flight.durationMs}ms` } : {}),
              left: `${flight.fromX}px`,
              top: `${flight.fromY}px`,
              '--card-dx': `${flight.toX - flight.fromX}px`,
              '--card-dy': `${flight.toY - flight.fromY}px`,
            } as CSSProperties
          }
        >
          {flight.kind === 'noble' ? (
            <NobleTile noble={noblesById.get(flight.nobleId ?? '') ?? NOBLES[0]!} size="compact" />
          ) : flight.kind === 'reserve-deck' && flight.tier ? (
            <DeckCard hideCount remainingCount={0} size="compact" tier={flight.tier} />
          ) : flight.card ? (
            <SplendorCard card={flight.card} size="compact" />
          ) : null}
        </div>
      ))}

      <ActionSheet
        open={actionSheetOpen && actionSheetContent !== null}
        title={actionSheetContent?.title ?? 'Action'}
        {...(actionSheetContent?.eyebrow ? { eyebrow: actionSheetContent.eyebrow } : {})}
        {...(forcedSheet === null ? { onClose: () => setSelection(null) } : {})}
        {...(actionSheetContent?.subtitle ? { subtitle: actionSheetContent.subtitle } : {})}
      >
        {actionSheetContent?.content ?? null}
      </ActionSheet>
    </main>
  );
};
