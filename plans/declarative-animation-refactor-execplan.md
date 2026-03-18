# Declarative Room Animation Refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [plans/PLANS.md](/Users/danwang/workspace/splendor/plans/PLANS.md).

## Purpose / Big Picture

After this change, the room board no longer manages chip, card, noble, and turn-handoff animations through one large local effect with scattered timers. Instead, the web client derives a declarative animation plan from `previousRoom -> nextRoom`, runs that plan through a centralized runner, and renders the board from a delayed `presentedRoom` while overlays and target-state animations play out. A user can verify this by opening the room Storybook animation stories and the actual room board: source counts change at departure, destination counts change on arrival, and turn highlighting waits until the final handoff phase.

## Progress

- [x] 2026-03-17 20:35 EDT Read `plans/PLANS.md`, inspected the existing `RoomScene` transition effect, and identified the extraction boundary between plan derivation, runner state, and DOM target resolution.
- [x] 2026-03-17 20:42 EDT Added frontend animation modules under `apps/web/src/lib/` for shared timing tokens, target identifiers, typed animation steps/phases/plans, and transition-plan derivation for the supported move families.
- [x] 2026-03-17 20:51 EDT Replaced the ad hoc `RoomScene` delay/timer machinery with `useAnimationRunner`, switched the board to render from `presentedRoom`, and mapped existing board refs to declarative animation targets.
- [x] 2026-03-17 20:54 EDT Centralized CSS timing through animation variables and aligned the main room styles with the shared timing config.
- [x] 2026-03-17 20:57 EDT Added Vitest coverage for animation-plan derivation and pure runner phase progression, and wired the web workspace test script/config to run them.
- [x] 2026-03-17 21:00 EDT Ran final validation: targeted lint, web tests, web typecheck, web build, and Storybook build all passed. Storybook still emits the existing large-chunk warning, but the build completes successfully.

## Surprises & Discoveries

- Observation: The new animation modules compiled cleanly once integrated, but the first round of type errors came from exact-optional-property handling in resolved card flights rather than from the plan logic itself.
  Evidence: `animation-runner.ts` initially failed typecheck until optional `card`, `nobleId`, and `tier` properties were only emitted when present.

- Observation: Using `defineConfig` from `vitest/config` directly in `apps/web/vite.config.ts` caused a Vite plugin type mismatch because the workspace was resolving different Vite type identities.
  Evidence: `npm run typecheck --workspace @splendor/web` reported incompatible `Plugin<any>` types until the Vitest settings were moved to a dedicated `apps/web/vitest.config.ts`.

## Decision Log

- Decision: Keep the shared game engine and server protocol unchanged and derive animation plans entirely on the frontend.
  Rationale: The server should remain the canonical state source. Animation timing is a presentation concern and is safer to evolve client-side.
  Date/Author: 2026-03-17 / Codex

- Decision: Reuse the existing board markup and DOM ref layout where possible instead of rewriting `RoomScene` around a wholly new scene graph.
  Rationale: This preserves the current mobile UI while replacing only the transition pipeline, which keeps the refactor lower risk.
  Date/Author: 2026-03-17 / Codex

- Decision: Introduce target identifiers such as `bank:white`, `market:<cardId>`, and `player:<id>:reserved`, then resolve them back to the existing room-scene refs.
  Rationale: This gives the runner a declarative target language without forcing a full component tree rewrite.
  Date/Author: 2026-03-17 / Codex

- Decision: Add a dedicated `apps/web/vitest.config.ts` instead of extending `vite.config.ts` with Vitest-specific config.
  Rationale: This avoids the Vite type-resolution conflict in the workspace and keeps build and test configuration independent.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

The main architectural goal is in place: `RoomScene` now animates through a plan runner rather than through a monolithic effect. Validation passed across targeted lint, web tests, web typecheck, web build, and Storybook build. The main remaining gap is architectural follow-through rather than correctness: if we want even deeper consistency later, the next step would be to move more of the remaining CSS class semantics behind named animation primitives so the Storybook primitive catalog and the board overlays share even more implementation.

## Context and Orientation

The old animation system lived almost entirely inside `apps/web/src/components/room-scene.tsx`. That file contained local timer refs, temporary board-state mutation helpers, chip and card overlay arrays, and a long effect that diffed `displayedRoom` against the latest server `room` to decide what to animate.

The new frontend-only animation system is split across:

- `apps/web/src/lib/animation-config.ts`, which defines shared timing tokens and CSS variables.
- `apps/web/src/lib/animation-targets.ts`, which defines stable string identifiers for animation sources and destinations.
- `apps/web/src/lib/animation-types.ts`, which defines the typed primitive/step/phase/plan model.
- `apps/web/src/lib/animation-plan.ts`, which derives a concrete `AnimationPlan` from `previousRoom` and `nextRoom`.
- `apps/web/src/lib/animation-runner.ts`, which advances phases over time and exposes the current `presentedRoom`, active target states, and resolved overlay flights.

`apps/web/src/components/room-scene.tsx` now consumes the runner. It still owns the board layout, action sheets, and target refs, but it no longer owns the timing or transition sequencing.

The Storybook catalog for composed move animations lives in `apps/web/src/components/room-scene.animations.stories.tsx`. The new primitive motion catalog lives in `apps/web/src/components/room-scene.animation-primitives.stories.tsx`.

The web workspace test harness now uses Vitest through `apps/web/vitest.config.ts`, with tests in `apps/web/src/lib/animation-plan.test.ts` and `apps/web/src/lib/animation-runner.test.ts`.

## Plan of Work

First, define the animation vocabulary in the web client. Create stable timing tokens, target identifiers, and plan/phase/step types. Then implement `deriveAnimationPlan(previousRoom, nextRoom)` so each supported move family emits an explicit sequence of phases and checkpoints.

Next, implement a runner that takes a plan and a target resolver, then advances through phases on timers while exposing a delayed `presentedRoom` and the overlay flights/target states for the current phase.

Then refactor `RoomScene` so it uses `useAnimationRunner` instead of its own transition effect. Keep the existing layout and target refs, but point them at the new target identifiers. Derive row/card/bank animation classes from the runner’s active target sets.

Finally, add tests and Storybook coverage for the plan derivation, runner phase progression, primitive motion language, and composed move animations.

## Concrete Steps

From the repository root:

1. Run `npm run test --workspace @splendor/web` and expect the animation plan and runner tests to pass.
2. Run `npm run typecheck --workspace @splendor/web` and expect no type errors.
3. Run `npm run lint -- apps/web/src/components/room-scene.tsx apps/web/src/lib/animation-config.ts apps/web/src/lib/animation-plan.ts apps/web/src/lib/animation-runner.ts apps/web/src/lib/animation-plan.test.ts apps/web/src/lib/animation-runner.test.ts apps/web/src/components/room-scene.animations.stories.tsx apps/web/src/components/room-scene.animation-primitives.stories.tsx apps/web/src/components/game-card.tsx` and expect no lint errors.
4. Run `npm run build --workspace @splendor/web` and expect a successful Vite production build.
5. Run `npm run build-storybook --workspace @splendor/web` and expect a successful Storybook build with the room animation catalogs available in the output.

## Validation and Acceptance

Acceptance is behavioral:

- On the actual room board, chip-take and chip-payment transitions should render from a delayed `presentedRoom`: the source count changes at departure, the destination count changes at arrival, and the turn highlight changes only after the final handoff phase.
- Visible market purchases should leave a blank source slot while the card flies out, then pop the replacement card into the same slot later.
- Blind reserve should never show the hidden card face during the animation.
- Reserved purchase should expand from the reserved area, flip to reveal the face, pause face-up, and then travel into the tableau.
- Noble claim should originate from the bottom viewport origin, stay square, and land in the player’s noble area.
- Storybook should show both primitive animations and composed move-family animations in dedicated sections.

## Idempotence and Recovery

These steps are safe to repeat. The tests and builds are read-only with respect to repository source files. If a validation step fails, fix the failing module and rerun the same command. The new runner and plan modules are additive; if a regression appears, the safest rollback is to restore `apps/web/src/components/room-scene.tsx` plus the `apps/web/src/lib/animation-*` files to the previous commit together rather than partially reverting only one file.

## Artifacts and Notes

Useful validation snapshots from this implementation:

    npm run test --workspace @splendor/web
    Test Files  2 passed (2)
    Tests       7 passed (7)

    npm run typecheck --workspace @splendor/web
    tsc -p ./tsconfig.json --pretty false --noEmit

    npm run build --workspace @splendor/web
    vite build
    ✓ built in 185ms

    npm run build-storybook --workspace @splendor/web
    storybook build
    ✓ built in 837ms
    note: existing large-chunk warning remains, but the build succeeds.

## Interfaces and Dependencies

The new frontend-only interfaces are:

- `apps/web/src/lib/animation-config.ts`
  - `animationTiming`
  - `animationCssVars`
- `apps/web/src/lib/animation-targets.ts`
  - `animationTargets`
  - `AnimationTargetId`
- `apps/web/src/lib/animation-types.ts`
  - `AnimationPrimitiveName`
  - `AnimationStep`
  - `AnimationPhase`
  - `AnimationPlan`
  - `DerivedTransitionKind`
  - `AnimationTargetState`
  - `ResolvedChipFlight`
  - `ResolvedCardFlight`
- `apps/web/src/lib/animation-plan.ts`
  - `deriveAnimationPlan(previousRoom, nextRoom)`
- `apps/web/src/lib/animation-runner.ts`
  - `useAnimationRunner(...)`
  - pure helpers for starting and advancing runner state

No server or shared-engine interface changes are required for this refactor.

Revision note: created this ExecPlan during implementation because `AGENTS.md` requires a living ExecPlan for significant refactors. Updated after the final validation pass to record that lint, tests, typecheck, web build, and Storybook build all succeeded.
