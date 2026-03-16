import {
  getAutoPayment,
  getCardEffectiveCost,
  isValidPaymentForCard,
  type Card,
  type CardTier,
  type GameState,
  type GemColor,
  type Move,
  type PaymentSelection,
  type TokenColor,
} from '@splendor/game-engine';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ActionSheet } from './action-sheet.js';
import { DeckCard, GemPip, getNobleImageSrc, NobleTile, SplendorCard } from './game-card.js';
import { GameCompleteScreen } from './game-complete-screen.js';
import { type AppUser, type DevUserProfile } from '../lib/auth.js';
import {
  cardTierOrder,
  deriveInteractionModel,
  derivePlayerSummaries,
  gemOrder,
  tokenColorOrder,
  type PlayerSummaryModel,
} from '../lib/game-ui.js';
import { type PublicRoomState, type RoomParticipant } from '../lib/types.js';

type Selection =
  | { readonly type: 'market-card'; readonly cardId: string }
  | { readonly type: 'reserved-card'; readonly cardId: string }
  | { readonly type: 'deck'; readonly tier: CardTier }
  | { readonly type: 'bank' }
  | { readonly type: 'menu' }
  | { readonly type: 'player'; readonly playerId: string }
  | null;

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

const ChipStrip = ({ counts }: { readonly counts: Readonly<Record<GemColor, number>> }) => (
  <div className="flex flex-wrap items-center gap-1">
    {gemOrder.map((color) => (
      <span key={`chip-${color}`} className={counts[color] > 0 ? '' : 'opacity-25'}>
        <GemPip color={color} count={counts[color]} size="sm" />
      </span>
    ))}
  </div>
);

const TableauStrip = ({ counts }: { readonly counts: PlayerSummaryModel['tableauBonuses'] }) => (
  <div className="flex flex-wrap items-center gap-1">
    {tokenColorOrder.map((color) => (
      <span
        key={`tableau-${color}`}
        className={`inline-flex min-w-7 items-center justify-center rounded-[0.45rem] border px-1.5 py-1 text-[10px] font-bold shadow-sm ${
          tableauBadgeStyles[color]
        } ${counts[color] > 0 ? '' : 'opacity-35'}`}
      >
        {counts[color]}
      </span>
    ))}
  </div>
);

const ReservedMarkers = ({ tiers }: { readonly tiers: readonly (1 | 2 | 3)[] }) => (
  <div className="flex items-center gap-1">
    {tiers.map((tier, index) => (
      <span
        key={`reserved-marker-${index}`}
        className={`relative h-6 w-4 rounded-[0.4rem] border bg-linear-to-br shadow-sm ${
          reservedMarkerStyles[tier - 1]
        }`}
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
        className="relative h-7 w-7 overflow-hidden rounded-[0.5rem] border border-emerald-200/30 bg-stone-950 shadow-sm"
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
  currentUserId,
  onPress,
  player,
  room,
}: {
  readonly currentUserId: string | undefined;
  readonly onPress: () => void;
  readonly player: PlayerSummaryModel;
  readonly room: PublicRoomState;
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
      className={`relative w-full overflow-hidden rounded-[1rem] border px-2.5 py-2 text-left ${
        isActive && isCurrentUser
          ? 'border-amber-300/45 bg-amber-300/10'
          : isWaitingOnOpponent
            ? 'border-sky-300/35 bg-sky-400/8'
            : 'border-white/8 bg-white/3'
      }`}
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
          <p className="text-lg leading-none font-semibold text-amber-50">{player.score}</p>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-stone-500">
          Cards ({totalTableauCards})
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <TableauStrip counts={player.tableauBonuses} />
          <ReservedMarkers tiers={player.reservedTiers} />
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-stone-500">
          Chips ({totalChips})
        </p>
        <div className="min-w-0">
          <ChipStrip counts={player.tokens} />
        </div>
      </div>

      {player.nobleIds.length > 0 ? (
        <div className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-stone-500">
            Nobles ({player.nobleIds.length})
          </p>
          <div className="min-w-0">
            <NobleMarkers nobleIds={player.nobleIds} />
          </div>
        </div>
      ) : null}
    </button>
  );
};

export interface RoomSceneProps {
  readonly currentUserId: string | undefined;
  readonly devProfiles: readonly DevUserProfile[];
  readonly errorMessage: string | null;
  readonly initialSelection?: Selection;
  readonly initialResultsVisible?: boolean;
  readonly isDevBypassEnabled: boolean;
  readonly isSocketConnected: boolean;
  readonly isWorking: boolean;
  readonly onJoinRoom: () => void;
  readonly onLogout: () => void;
  readonly onSelectDevProfile: (profileId: string) => void;
  readonly onStartGame: () => void;
  readonly onSubmitMove: (move: Move) => void;
  readonly room: PublicRoomState | null;
  readonly roomId: string;
  readonly user: AppUser | undefined;
}

export const RoomScene = ({
  currentUserId,
  devProfiles,
  errorMessage,
  initialSelection = null,
  initialResultsVisible,
  isDevBypassEnabled,
  isSocketConnected,
  isWorking,
  onJoinRoom,
  onLogout,
  onSelectDevProfile,
  onStartGame,
  onSubmitMove,
  room,
  roomId,
}: RoomSceneProps) => {
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [bankSelection, setBankSelection] = useState<readonly TokenColor[]>([]);
  const [discardSelection, setDiscardSelection] = useState<readonly GemColor[]>([]);
  const [purchaseSelection, setPurchaseSelection] = useState<PaymentSelection>(createEmptyPaymentSelection);
  const game = room?.game ?? null;
  const [showGameComplete, setShowGameComplete] = useState(
    initialResultsVisible ?? game?.status === 'finished',
  );
  const wasFinishedRef = useRef(game?.status === 'finished');
  const interaction = game ? deriveInteractionModel(game, currentUserId) : null;
  const playerSummaries = game ? derivePlayerSummaries(game) : [];
  const joined = room ? currentUserIsParticipant(room.participants, currentUserId) : false;
  const canJoin = room !== null && !joined && room.status === 'waiting';
  const canStart =
    room !== null &&
    room.hostUserId === currentUserId &&
    room.status === 'waiting' &&
    room.participants.length >= 2;
  const canSubmitRealtimeMoves = room?.status === 'in_progress' ? isSocketConnected : true;

  useEffect(() => {
    setSelection(initialSelection);
    setBankSelection([]);
    setDiscardSelection([]);
    setPurchaseSelection(createEmptyPaymentSelection());
  }, [initialSelection, room?.stateVersion]);

  useEffect(() => {
    const isFinished = game?.status === 'finished';

    if (isFinished && !wasFinishedRef.current) {
      setShowGameComplete(true);
      setSelection(null);
      setBankSelection([]);
      setDiscardSelection([]);
      setPurchaseSelection(createEmptyPaymentSelection());
    } else if (!isFinished) {
      setShowGameComplete(false);
    }

    wasFinishedRef.current = isFinished;
  }, [game?.status]);

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
  const activePlayer = game?.players[game.turn.activePlayerIndex] ?? null;
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
    game?.turn.kind === 'discard' ? 'discard' : game?.turn.kind === 'noble' ? 'noble' : null;
  const actionSheetOpen = forcedSheet !== null || selection !== null;
  const currentTurnCopy =
    game && interaction
      ? turnBannerCopy(game, interaction.isCurrentUsersTurn, interaction.activePlayerName)
      : 'Waiting for room state';

  const toggleBankColor = (color: TokenColor) => {
    setSelection({ type: 'bank' });
    setBankSelection((current) => {
      const selectedCount = current.filter((candidate) => candidate === color).length;
      const availableCount = game?.bank[color] ?? 0;

      if (current.length >= 3 || selectedCount >= availableCount) {
        return current;
      }

      return [...current, color];
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

  const renderMarketSheet = (card: Card) => {
    const purchaseMove = interaction?.purchaseVisibleByCardId[card.id];
    const reserveMove = interaction?.reserveVisibleByCardId[card.id];
    const isActionable =
      interaction?.isCurrentUsersTurn &&
      game?.turn.kind === 'main-action' &&
      canSubmitRealtimeMoves;
    const autoPayment = activePlayer ? getAutoPayment(activePlayer, card) : null;
    const effectiveCost = activePlayer ? getCardEffectiveCost(activePlayer, card) : createEmptyPaymentSelection().tokens;
    const manualSelectedCount = totalSelectedPayment(purchaseSelection);
    const manualPaymentValid =
      activePlayer !== null && isValidPaymentForCard(activePlayer, card, purchaseSelection);
    const totalEffectiveCost = tokenColorOrder.reduce((sum, color) => sum + effectiveCost[color], 0);

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
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Effective cost</p>
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
                {totalEffectiveCost === 0 ? (
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
                  type: 'purchase-visible',
                  cardId: card.id,
                  payment: purchaseSelection,
                });
                return;
              }

              if (purchaseMove && autoPayment) {
                submitAndReset({
                  type: 'purchase-visible',
                  cardId: card.id,
                  payment: autoPayment,
                });
              }
            }}
            type="button"
          >
            {manualSelectedCount > 0 ? 'Buy' : 'Auto-buy'}
          </button>
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
        </div>
      </div>
    );
  };

  const renderReservedSheet = (card: Card) => {
    const purchaseMove = interaction?.purchaseReservedByCardId[card.id];
    const isActionable =
      interaction?.isCurrentUsersTurn &&
      game?.turn.kind === 'main-action' &&
      canSubmitRealtimeMoves;

    return (
      <div className="space-y-4">
        <div className="w-24">
          <SplendorCard card={card} size="compact" />
        </div>
        <button
          className={primaryButtonClass}
          disabled={!purchaseMove || !isActionable}
          onClick={() => {
            if (purchaseMove) {
              submitAndReset(purchaseMove);
            }
          }}
          type="button"
        >
          Buy
        </button>
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Selected {bankSelection.length}/3</p>
          <button
            className="text-xs uppercase tracking-[0.22em] text-stone-500 transition hover:text-stone-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-stone-500"
            disabled={bankSelection.length === 0}
            onClick={() => setBankSelection([])}
            type="button"
          >
            Clear
          </button>
        </div>
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
          Tap tokens to move them into the discard pile. Submit once you have exactly {requiredCount}.
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
            <button
              key={`noble-${noble.id}`}
              className={`rounded-[1rem] text-left transition ${
                claimMove ? 'active:scale-[0.98]' : 'cursor-default opacity-35 saturate-50'
              }`}
              disabled={!claimMove || !canSubmitRealtimeMoves}
              onClick={() => {
                if (claimMove) {
                  submitAndReset(claimMove);
                }
              }}
              type="button"
            >
              <NobleTile isSelected={Boolean(claimMove)} noble={noble} size="compact" />
            </button>
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
          <div className="rounded-[0.9rem] border border-white/8 bg-black/15 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">VP</p>
            <p className="mt-1 text-3xl leading-none font-semibold text-amber-50">
              {playerSummary.score}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-500">Tableau bonuses</p>
              <TableauStrip counts={playerSummary.tableauBonuses} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-500">Chips</p>
              <ChipStrip counts={playerSummary.tokens} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-500">
                Reserved ({playerSummary.reservedCount})
              </p>
              <ReservedMarkers tiers={playerSummary.reservedTiers} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-500">
                Nobles ({playerSummary.nobleIds.length})
              </p>
              <NobleMarkers nobleIds={playerSummary.nobleIds} />
            </div>
          </div>
        </div>

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
                      disabled={!canSubmitRealtimeMoves}
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

  const renderMenuSheet = () => (
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

      {isDevBypassEnabled ? (
        <div className="rounded-[1rem] border border-white/8 bg-white/4 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-500">Dev profile</p>
          <div className="flex flex-wrap gap-1.5">
            {devProfiles.map((profile) => (
              <button
                key={profile.id}
                className="rounded-full border border-sky-200/15 px-2.5 py-1.5 text-[11px] text-sky-100 transition hover:border-sky-200/35 hover:bg-sky-100/5"
                onClick={() => onSelectDevProfile(profile.id)}
                type="button"
              >
                {profile.displayName}
              </button>
            ))}
          </div>
        </div>
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
        content: renderMarketSheet(selectedVisibleCard),
      };
    }

    if (selection?.type === 'reserved-card' && selectedReservedCard) {
      return {
        eyebrow: 'Reserved card',
        title: 'Reserved card',
        subtitle: 'Reserved cards live off-board until you can afford them.',
        content: renderReservedSheet(selectedReservedCard),
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_28%),linear-gradient(180deg,_#1e140f,_#090d15)] pb-28 text-stone-100">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-2 py-2">
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
            {!canSubmitRealtimeMoves ? (
              <span className="rounded-full border border-sky-300/20 bg-sky-300/8 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-100">
                Connecting
              </span>
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
            <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
              <div className="space-y-1.5">
                {playerSummaries.map((player) => (
                  <PlayerSummaryRow
                    key={`summary-${player.id}`}
                    currentUserId={currentUserId}
                    onPress={() => {
                      if (game) {
                        setSelection({ type: 'player', playerId: player.id });
                      }
                    }}
                    player={player}
                    room={room}
                  />
                ))}
              </div>
            </section>

            {game && showGameComplete && game.status === 'finished' ? (
              <GameCompleteScreen
                game={game}
                onViewBoard={() => setShowGameComplete(false)}
                playerSummaries={playerSummaries}
              />
            ) : game ? (
              <>
                <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                  <button
                    className={`flex w-full items-center gap-2 rounded-[0.8rem] text-left transition ${
                      selection?.type === 'bank' ? 'bg-white/5' : ''
                    } ${
                      interaction?.isCurrentUsersTurn &&
                      game.turn.kind === 'main-action' &&
                      canSubmitRealtimeMoves
                        ? 'active:scale-[0.995]'
                        : ''
                    }`}
                    disabled={
                      !interaction?.isCurrentUsersTurn ||
                      game.turn.kind !== 'main-action' ||
                      !canSubmitRealtimeMoves
                    }
                    onClick={() => openBankSelection()}
                    type="button"
                  >
                    <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Bank</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {gemOrder.map((color) => (
                        <span
                          key={`bank-${color}`}
                          className={`${color === 'gold' ? 'ml-2' : ''}`}
                        >
                          <GemPip color={color} count={game.bank[color]} size="sm" />
                        </span>
                      ))}
                    </div>
                  </button>
                </section>

                <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                  <p className="px-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    Market
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {cardTierOrder.map((tier) => {
                      const tierKey = `tier${tier}` as const;

                      return (
                        <section key={`tier-${tier}`} className="px-0.5">
                          <div className="grid grid-cols-5 gap-1.5">
                            <DeckCard
                              disabled={
                                !interaction?.isCurrentUsersTurn ||
                                game.turn.kind !== 'main-action' ||
                                !canSubmitRealtimeMoves
                              }
                              isSelected={selection?.type === 'deck' && selection.tier === tier}
                              onPress={() => setSelection({ type: 'deck', tier })}
                              remainingCount={game.decks[tierKey].length}
                              size="compact"
                              tier={tier}
                            />
                            {game.market[tierKey].map((card) => (
                              <SplendorCard
                                key={card.id}
                                card={card}
                                disabled={!canSubmitRealtimeMoves}
                                isSelected={selection?.type === 'market-card' && selection.cardId === card.id}
                                onPress={() => setSelection({ type: 'market-card', cardId: card.id })}
                                size="compact"
                              />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                  <p className="px-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    Nobles
                  </p>
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
              </>
            ) : (
              <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-3 text-sm text-stone-300 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                Waiting for the host to start the match.
              </section>
            )}
          </>
        ) : (
          <section className="rounded-[1rem] border border-white/10 bg-stone-950/72 p-3 text-sm text-stone-300 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
            Loading room state from the server.
          </section>
        )}
      </div>

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
