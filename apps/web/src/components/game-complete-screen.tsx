import { type GameState } from '@splendor/game-engine';
import { Link } from 'react-router-dom';

import { type PlayerSummaryModel } from '../lib/game-ui.js';

const TrophyIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4 text-amber-300"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M6 3h12v2h2a1 1 0 0 1 1 1v2a5 5 0 0 1-5 5h-.28A6.98 6.98 0 0 1 13 16.93V19h4v2H7v-2h4v-2.07A6.98 6.98 0 0 1 8.28 13H8a5 5 0 0 1-5-5V6a1 1 0 0 1 1-1h2V3Zm-1 4v1a3 3 0 0 0 3 3V7H5Zm11 4a3 3 0 0 0 3-3V7h-3v4Z" />
  </svg>
);

export interface GameCompleteScreenProps {
  readonly game: GameState;
  readonly onViewBoard: () => void;
  readonly playerSummaries: readonly PlayerSummaryModel[];
}

export const GameCompleteScreen = ({
  game,
  onViewBoard,
  playerSummaries,
}: GameCompleteScreenProps) => {
  const winnerIds = new Set(game.result?.winners ?? []);
  const summaryByPlayerId = Object.fromEntries(
    playerSummaries.map((summary) => [summary.id, summary]),
  ) as Record<string, PlayerSummaryModel>;
  const winnerDisplayNames = game.players
    .filter((player) => winnerIds.has(player.identity.id))
    .map((player) => player.identity.displayName);

  return (
    <section className="rounded-[1rem] border border-white/10 bg-stone-950/80 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-amber-300/70">Game complete</p>
          <h2 className="font-serif text-3xl text-amber-50">Final score</h2>
          <div className="rounded-[1.2rem] border border-amber-200/15 bg-amber-300/8 px-4 py-4">
            <p className="text-sm text-stone-200">
              {winnerDisplayNames.length === 1
                ? `${winnerDisplayNames[0]} wins with ${game.result?.winningScore ?? 0} points.`
                : `${winnerDisplayNames.join(', ')} tie at ${game.result?.winningScore ?? 0} points.`}
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Final standings</p>
          <div className="space-y-2">
            {[...game.players]
              .sort((left, right) => {
                const leftScore = summaryByPlayerId[left.identity.id]?.score ?? 0;
                const rightScore = summaryByPlayerId[right.identity.id]?.score ?? 0;

                if (rightScore !== leftScore) {
                  return rightScore - leftScore;
                }

                return left.identity.displayName.localeCompare(right.identity.displayName);
              })
              .map((player) => {
                const isWinner = winnerIds.has(player.identity.id);
                const playerScore = summaryByPlayerId[player.identity.id]?.score ?? 0;

                return (
                  <div
                    key={`final-standing-${player.identity.id}`}
                    className={`flex items-center justify-between rounded-[1rem] border px-3 py-3 ${
                      isWinner
                        ? 'border-amber-300/35 bg-amber-300/10'
                        : 'border-white/8 bg-white/4'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                          isWinner ? 'bg-amber-300/18' : 'bg-white/6'
                        }`}
                      >
                        {isWinner ? <TrophyIcon /> : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-50">
                          {player.identity.displayName}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                          {player.purchasedCards.length} cards
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">VP</p>
                      <p className="text-xl font-semibold text-amber-50">{playerScore}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <button
          className="rounded-full bg-amber-300 px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
          onClick={onViewBoard}
          type="button"
        >
          View board
        </button>

        <Link
          className="inline-flex justify-center rounded-full border border-white/10 bg-white/4 px-3 py-2 text-sm font-medium text-stone-100 transition hover:border-white/20 hover:bg-white/6"
          to="/"
        >
          Back to lobby
        </Link>
      </div>
    </section>
  );
};
