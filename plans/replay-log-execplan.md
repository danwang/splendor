# Replay From Log

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [plans/PLANS.md](/Users/danwang/workspace/splendor/plans/PLANS.md).

## Purpose / Big Picture

After this change, a player can click a log entry and temporarily replay that exact transition on the board, even if it happened several moves ago. The board enters a visible replay mode with transport controls, freezes live interaction, reuses the same animation runner that powers live moves, and lets the player move backward, replay again, move forward, or jump back to the live game.

## Progress

- [x] 2026-03-17 21:10 EDT Inspected `room-page`, `room-activity`, and `room-scene` to identify where room history, log entries, and the animation runner needed to connect.
- [x] 2026-03-17 21:20 EDT Added bounded room-state history in `apps/web/src/routes/room-page.tsx` and threaded that history into `RoomScene`.
- [x] 2026-03-17 21:24 EDT Extended `RoomActivityEntry` with `beforeStateVersion` and `afterStateVersion`, then added `deriveRoomHistoryEntries(...)` so replay can derive its transition list from the canonical room history buffer.
- [x] 2026-03-17 21:28 EDT Added replay mode UI in `apps/web/src/components/room-scene.tsx`: clicking a log item starts replay, the board shows a replay banner and controls, and the scene disables live moves while replay is active.
- [x] 2026-03-17 21:30 EDT Updated `useAnimationRunner(...)` to support resettable historical playback by accepting a replay reset key and initial presented room.
- [x] 2026-03-17 21:32 EDT Added a replay Storybook board story and validated web lint, tests, typecheck, build, and Storybook build.

## Surprises & Discoveries

- Observation: Replay mode works best when the log is rebuilt from the room history buffer instead of being accumulated only from live incremental diffs.
  Evidence: Static Storybook replay stories would otherwise have no log entries because no live transition ever occurred inside the story itself.

- Observation: The animation runner needed a reset hook to replay old transitions deterministically.
  Evidence: Reusing the runner without a reset key would keep its current `presentedRoom`, which is correct for live play but wrong for “jump back to an old `before -> after` transition.”

## Decision Log

- Decision: Rebuild log entries from the room history buffer inside `RoomScene`, even though live incremental log derivation still exists conceptually.
  Rationale: This keeps replay deterministic after refreshes and makes Storybook/history-driven views behave the same as live play.
  Date/Author: 2026-03-17 / Codex

- Decision: Enter replay mode by automatically switching the bottom panel back to `Board`.
  Rationale: A replay request is about understanding board state change, so showing the board immediately is better than keeping the user in the log list.
  Date/Author: 2026-03-17 / Codex

- Decision: Freeze move submission during replay rather than trying to mix live interaction with historical playback.
  Rationale: The board is intentionally showing a historical state, so allowing moves would be confusing and unsafe.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

The replay UX is in place and behaves as intended for the first version: players can click a log row, see a replay banner around the board, navigate through historical transitions, and return to live play. The feature intentionally reuses the same animation runner and plan derivation as live moves, so old replays look like real gameplay rather than a separate one-off animation system. A natural next step, if desired later, would be a “watch entire game” timeline mode built on the same history buffer.

## Context and Orientation

The relevant files are:

- `apps/web/src/routes/room-page.tsx`, which owns the current room websocket state and now also stores the bounded room history buffer.
- `apps/web/src/lib/room-activity.ts`, which defines log entries. Replay depends on each entry knowing the state version before and after the transition it represents.
- `apps/web/src/components/room-scene.tsx`, which renders the board, the log, and now the replay toolbar and historical playback mode.
- `apps/web/src/lib/animation-runner.ts`, which already animates `before -> after` room transitions and now supports a reset key for replay.
- `apps/web/src/components/room-scene.board.stories.tsx`, which now includes a replay-mode story.

The core replay idea is simple: a log row is not just text, it points to a transition between two historical room states. Replay mode resets the animation runner to the `before` room and uses the `after` room as the canonical target so the same move animation runs again on demand.

## Plan of Work

First, capture enough history to replay old transitions. Add a bounded room history buffer in `RoomPage`, merging newly loaded or websocket-delivered `PublicRoomState` snapshots by `stateVersion`.

Next, make every log entry point to a real historical transition by adding `beforeStateVersion` and `afterStateVersion`, and provide a helper that derives the visible log list from the room history buffer.

Then, refactor `RoomScene` to enter replay mode. Replay mode chooses one historical transition, resets the animation runner to the `before` room, drives it toward the `after` room, disables live moves, and shows a visible replay banner with `Previous`, `Replay`, `Next`, and `Live`.

Finally, add Storybook coverage and validate the web workspace.

## Concrete Steps

From the repository root:

1. Run `npm run lint -- apps/web/src/routes/room-page.tsx apps/web/src/components/room-scene.tsx apps/web/src/components/room-scene.board.stories.tsx apps/web/src/components/room-scene.story-helpers.ts apps/web/src/lib/room-activity.ts apps/web/src/lib/animation-runner.ts` and expect no lint errors.
2. Run `npm run test --workspace @splendor/web` and expect all web tests to pass.
3. Run `npm run typecheck --workspace @splendor/web` and expect no type errors.
4. Run `npm run build --workspace @splendor/web` and expect a successful Vite build.
5. Run `npm run build-storybook --workspace @splendor/web` and expect the replay board story to build successfully alongside the existing board/modals/animation stories.

## Validation and Acceptance

Acceptance is user-visible:

- Clicking a replayable log row switches the board into a visible replay mode.
- Replay mode shows transport controls above the board.
- The board replays the exact historical transition represented by the clicked log row, even if the live game has advanced.
- `Previous`, `Replay`, and `Next` step through replayable log items in chronological order.
- `Live` exits replay mode and returns the board to the latest room state.
- While replaying, move submission is disabled.
- If the live game advances during replay, the replay banner indicates that live state has moved on.

## Idempotence and Recovery

All commands above are safe to rerun. The room history buffer is in-memory only and resets naturally on refresh, so there is no persistent migration or destructive step. If replay behavior regresses, the safest rollback is to restore the changes to `room-page`, `room-activity`, `room-scene`, and `animation-runner` together, since they form one coherent feature.

## Artifacts and Notes

Validation snapshots from this feature work:

    npm run test --workspace @splendor/web
    Test Files  2 passed (2)
    Tests       7 passed (7)

    npm run typecheck --workspace @splendor/web
    tsc -p ./tsconfig.json --pretty false --noEmit

    npm run build --workspace @splendor/web
    vite build
    ✓ built in 146ms

    npm run build-storybook --workspace @splendor/web
    storybook build
    ✓ built in 788ms
    note: existing large-chunk warning remains, but the build succeeds.

## Interfaces and Dependencies

The replay feature adds or changes these frontend interfaces:

- `apps/web/src/lib/room-activity.ts`
  - `RoomActivityEntry.beforeStateVersion`
  - `RoomActivityEntry.afterStateVersion`
  - `deriveRoomHistoryEntries(history, limit?)`
- `apps/web/src/lib/animation-runner.ts`
  - `useAnimationRunner(...)` now accepts `resetKey` and `initialPresentedRoom`
- `apps/web/src/components/room-scene.tsx`
  - `RoomSceneProps.roomHistory`
  - `RoomSceneProps.initialReplayAfterStateVersion`

No backend or game-engine wire contract changes are required.

Revision note: created this ExecPlan while implementing replay because the repository requires a living ExecPlan for complex features. This version reflects the implemented design and the completed validation results.
