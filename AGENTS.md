# Repository Guidance

This repository is a TypeScript monorepo for a multiplayer web implementation of Splendor. Use an ExecPlan from [plans/PLANS.md](/Users/danwang/workspace/splendor/plans/PLANS.md) for complex features or major refactors, and keep any active plan in `plans/` up to date as work progresses.

## Setup

Install dependencies from the repository root:

    npm install

## Common Commands

Run these from the repository root unless a task explicitly calls for a workspace-local command:

    npm run lint
    npm run typecheck
    npm run test
    npm run format

For the game engine workspace specifically:

    npm run test --workspace @splendor/game-engine
    npm run typecheck --workspace @splendor/game-engine

## Code Style

All runtime code should be TypeScript.

Use arrow functions only. Do not introduce `function` declarations or `function` expressions.

Prefer pure functional style, especially in `packages/game-engine`. Engine code must not mutate input objects, must not rely on ambient process state, and should return new data structures for all state transitions.

Keep domain logic data-first. Prefer explicit tagged unions and readonly structures over class-heavy designs.

Use Prettier and ESLint rather than hand-formatting or ad hoc local conventions.

## Repository Shape

`packages/game-engine` contains the reusable rules engine and should remain framework-free.

`apps/` is reserved for application entry points such as the future server and web client.

`plans/` contains execution plans and design notes.

## Testing Expectations

When changing engine rules, add or update tests that exercise observable game behavior, not just helper internals.

Prefer scenario-style tests for move sequences and end-of-round outcomes when the rule interaction is non-trivial.
