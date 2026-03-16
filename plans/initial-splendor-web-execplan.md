# Build the initial Splendor web application stack

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `plans/PLANS.md` from the repository root.

## Purpose / Big Picture

After this work, a new contributor will be able to clone this repository, install dependencies, run a TypeScript monorepo containing a pure Splendor game engine, start a backend server that supports authenticated multiplayer rooms, and open a browser client that can create or join a live game. The initial version should prove the full loop: sign in through Auth0, create a room with configurable target score between 15 and 21, connect multiple browser sessions, perform legal game actions, and observe synchronized state updates in real time.

The implementation should be done in layers so each layer is independently usable. The game engine must stand on its own as a reusable TypeScript module with no mutation and no framework coupling. The server must expose clear room and session interfaces and enforce rules using the engine. The frontend must render the board state, prompt only legal moves, and stay synchronized over a bidirectional socket connection.

## Progress

- [x] (2026-03-15 15:48Z) Initialized the repository as a git repository.
- [x] (2026-03-15 15:55Z) Created the monorepo scaffold with root workspace configuration, TypeScript base config, Prettier, ESLint, and shared scripts.
- [x] (2026-03-15 17:39Z) Created `packages/game-engine` with immutable domain types, official checked-in base-game card data, deterministic seeded setup helpers, reducer-style move application, structured invalid-move errors, and a passing test suite including scenario-style rule coverage.
- [x] (2026-03-15 20:50Z) Created `apps/server` with Fastify app bootstrap, health endpoint, Auth0 JWT verification, in-memory room lifecycle endpoints, websocket session handling, and passing integration tests covering auth, room creation, invalid moves, and synchronized broadcasts.
- [x] (2026-03-15 21:10Z) Created `apps/web` with React, Tailwind, Auth0 login wiring, lobby and room screens, legal-move-driven controls, and websocket room synchronization against the server.
- [x] (2026-03-15 21:12Z) Added developer documentation and deployment scripts for local development and single-service builds where the Fastify server serves the built frontend.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: The repository currently contains only `plans/PLANS.md`, so all design assumptions in this plan are greenfield assumptions that must be validated during implementation.

- Observation: The move model needed to allow discarding gold as well as colored gems.
  Evidence: Reserving a card can push a player above ten tokens because reservation grants a gold token, so a discard payload typed only as colored tokens would reject legal turns.

- Observation: The public CSV at `splendimax` was good enough to serve as a transcription source for the 90 development cards once converted into checked-in static data.
  Evidence: `packages/game-engine/src/data/cards.ts` now contains an explicit 90-card list derived from the CSV, and tests still pass against that data.

- Observation: The workspace package boundary matters for the engine because the server consumes its published `dist` output, not raw source files.
  Evidence: `@splendor/server` typechecking initially saw stale `@splendor/game-engine` typings until `packages/game-engine` was rebuilt and its package build config was tightened to emit a consistent `dist` entrypoint.

- Observation: A single-service deployment shape is easiest if the server serves the built frontend rather than trying to coordinate two separate long-lived processes in production.
  Evidence: The repository now has a root `build` that emits `apps/web/dist` before building the server, and `apps/server/src/app.ts` serves that static bundle when present.

## Decision Log

- Decision: Use a single JavaScript monorepo with npm workspaces rather than separate repositories.
  Rationale: The engine, server, and frontend will share types and move semantics. A monorepo keeps versioning simple and avoids duplicate TypeScript configuration while the project is small.
  Date/Author: 2026-03-15 / Codex

- Decision: Use strict TypeScript everywhere and enforce arrow-function-only style through ESLint.
  Rationale: The engine is intended to be pure and reusable. Strict typing plus lint rules makes accidental mutation and ad hoc coding style less likely.
  Date/Author: 2026-03-15 / Codex

- Decision: Put the game engine in `packages/game-engine` and keep it framework-free.
  Rationale: The rules engine should be reusable by the server, by tests, and potentially by future tools such as bots, simulations, or offline replay viewers.
  Date/Author: 2026-03-15 / Codex

- Decision: Use Fastify on the server and the browser `WebSocket` protocol through Fastify's websocket support.
  Rationale: Fastify provides typed HTTP routes, good plugin structure, and a straightforward way to expose both REST endpoints and websocket endpoints without introducing a larger real-time framework.
  Date/Author: 2026-03-15 / Codex

- Decision: Use Auth0 for identity, with login in the frontend and JWT verification in the backend.
  Rationale: This satisfies the authentication requirement while keeping password handling out of this repository. The server will trust verified access tokens rather than storing credentials locally.
  Date/Author: 2026-03-15 / Codex

- Decision: Support target scores from 15 through 21 inclusive in room settings, defaulting to 15.
  Rationale: The user explicitly requested configurable settings between 15 and 21. The engine should treat target score as data, not as a hard-coded rule.
  Date/Author: 2026-03-15 / Codex

- Decision: Start the pure engine with deterministic deck order by default rather than random shuffling.
  Rationale: Deterministic setup is easier to test, easier to debug, and sufficient for the bootstrap and engine milestone. The future server can randomize deck order and pass it into `GameConfig`.
  Date/Author: 2026-03-15 / Codex

- Decision: Keep randomness outside the reducer and formalize seeded setup as a pure composition of `createShuffledSetup(seed)` and setup helpers.
  Rationale: This preserves deterministic state transitions while still giving the server or tests a simple seeded initialization path.
  Date/Author: 2026-03-15 / Codex

## Outcomes & Retrospective

The repository now has a working baseline engine milestone: strict TypeScript monorepo bootstrap, a pure functional Splendor engine, seeded setup helpers, structured move validation errors, and passing tests. Remaining work has shifted to server and frontend integration rather than core engine mechanics.

The repository now also has a working frontend and deployment path: a React/Tailwind/Auth0 client in `apps/web`, websocket-driven room synchronization, and a single-process production shape where Fastify serves the built frontend bundle. The main remaining work has shifted from core stack creation to refinement: richer frontend coverage, manual Auth0 verification in a live environment, and lint stabilization if the dependency graph changes again.

## Context and Orientation

The repository is effectively empty. The only existing file is `plans/PLANS.md`, which defines the required structure for this execution plan. There is no existing package manager choice, build system, lint configuration, server, client, or game logic. Every file mentioned below must be created unless noted otherwise.

Splendor is a turn-based board game about collecting gem tokens and buying development cards that provide permanent gem discounts and victory points. For this project, the engine should model the base game only, not expansions. The core pieces of the rules that matter for implementation are:

Each player has a personal supply of gem tokens in five colors plus gold joker tokens. Colored tokens are used to buy cards. Gold tokens are wildcards that can substitute for any missing color when buying a card.

The table contains three face-up rows of development cards, usually referred to as tiers 1, 2, and 3. Each tier has its own draw deck and four visible face-up cards. Every development card has a bonus color, a cost in colored gems, and possibly victory points.

On a turn, a player performs exactly one main action. The legal main actions are:

Take three tokens of three distinct colors, provided those tokens are available in the bank.

Take two tokens of one color, only if at least four tokens of that color were in the bank before taking them.

Reserve one visible card or the top card of a deck, if the player currently has fewer than three reserved cards. Reserving grants one gold token if any gold token remains in the bank.

Purchase one visible card or one reserved card, paying with colored tokens plus gold substitutions after applying permanent discounts from previously purchased cards.

After taking or reserving tokens, if the player now holds more than ten total tokens, the same turn must include discarding down to exactly ten. The engine should therefore represent these turns as either a single compound move or a move plus required discard payload; the implementation section below chooses a compound move so the state is never left half-resolved.

At the end of a turn, if the player qualifies for one or more nobles, exactly one noble is taken automatically. A noble has a requirement expressed as a number of permanent card bonuses in certain colors and grants points. The engine should deterministically choose the noble when more than one is available; the server and frontend should expose which noble was awarded. To keep game outcomes deterministic without player prompts, the engine will award the available noble that appears first in setup order unless a later implementation milestone explicitly adds a choice prompt.

The game ends at the end of the round in which at least one player reaches or exceeds the target score. Because room settings allow a custom target, the engine must track that value in game configuration. If multiple players meet the target at end of round, the winner is the tied player with the fewest purchased development cards. If still tied, the engine should preserve all tied winners in result data rather than inventing an unsupported extra rule.

For the base game setup, use the standard token counts by player count: four players use seven tokens of each color, three players use five, and two players use four. Gold tokens are always five. Nobles in play equal player count plus one. The room creator chooses the player count indirectly by the number of seats in the room; support two to four players in the first version.

A "pure functional" engine in this repository means that exported engine functions do not mutate their inputs, do not read or write global process state, and return new plain data structures for all outputs. Internal helper functions should follow the same rule. Tests should freeze representative inputs or use deep equality assertions to prove immutability.

## Plan of Work

Begin by creating the repository scaffold. Run `git init` in the repository root. Add a root `package.json` using npm workspaces with `apps/*` and `packages/*`. Create `tsconfig.base.json` with strict settings, `eslint.config.js` or `eslint.config.mjs` using the modern flat configuration format, `.prettierrc.json`, `.prettierignore`, `.gitignore`, and a `README.md` that explains the monorepo layout. The linter must include `func-style` configured to require function expressions, and `prefer-arrow-callback`; paired with code review discipline, that gives an arrow-function-only codebase. Also enable rules that discourage mutation, such as preferring `const` and banning parameter reassignment. Root scripts should include `lint`, `format`, `test`, `typecheck`, and a development command that can start server and web together once those apps exist.

Next, create `packages/game-engine`. This package is the most important part of the system and must be implemented before any network or UI work. Create `packages/game-engine/src/types.ts` for pure domain types, `packages/game-engine/src/setup.ts` for deterministic game creation, `packages/game-engine/src/legal-moves.ts` for move generation, `packages/game-engine/src/apply-move.ts` for move execution, `packages/game-engine/src/selectors.ts` for derived values such as affordable cards and available nobles, and `packages/game-engine/src/index.ts` for the public surface. The engine should expose a small, explicit interface:

`GameConfig` describes target score, seat count, selected nobles, and optionally seeded deck order for deterministic tests.

`GameState` contains turn order, players, bank tokens, face-up cards, hidden deck stacks, nobles, history, phase, and optional terminal result.

`PlayerState` contains identity, tokens, purchased cards, reserved cards, nobles, and derived score inputs.

`Move` is a tagged union that covers each player action. Include move shapes for taking distinct tokens, taking a pair, reserving a visible card, reserving from deck, purchasing visible card, purchasing reserved card, and discard payloads for over-limit turns. Discard payloads must allow gold as well as colored gems because reserve actions can create gold overflow.

`EngineResult` returns the next `GameState` plus an event list describing what happened in plain data. The event list is useful for both server broadcasts and future replay logs.

Create the engine so that legal move generation and move application are separate. `listLegalMoves(state)` should return all valid moves for the active player in the current state. `applyMove(state, move)` should validate the move, return a rich error type for invalid input, and otherwise return the next state and events. This split lets the server trust but verify incoming client actions and allows the frontend to render only valid controls.

Represent cards and nobles as data tables under `packages/game-engine/src/data/`. Include the full base-game card list and noble list in static JSON or TypeScript constant form. Store each card with a stable identifier so move payloads never depend on array indexes. For deterministic setup, implement deck shuffling through an injected randomizer interface or precomputed deck order supplied in `GameConfig`; use the latter for early simplicity. During real game creation, the server may create randomized deck orders and pass them into the engine.

Testing for the engine must be exhaustive enough that the server can rely on it. Add Vitest to the workspace. Create `packages/game-engine/src/*.test.ts` files for setup, legal move generation, token constraints, reservation limits, gold-token handling, affordability with permanent discounts, noble acquisition, target-score end conditions, tie resolution, and immutability. Include table-driven tests for tricky edge cases such as buying with exact discounts, buying with only gold covering deficits, reserving when gold is empty, taking tokens when the bank lacks eligible colors, and discarding down to ten after a token-taking move.

After the engine is stable, create `apps/server`. Use Fastify with TypeScript and organize code into `apps/server/src/main.ts`, `apps/server/src/app.ts`, `apps/server/src/config.ts`, `apps/server/src/auth/verify-auth0-token.ts`, `apps/server/src/routes/health.ts`, `apps/server/src/routes/rooms.ts`, `apps/server/src/realtime/game-socket.ts`, `apps/server/src/services/room-store.ts`, and `apps/server/src/services/game-service.ts`. Keep persistent storage simple in the first version: an in-memory room store is acceptable, provided its interface is designed so a database can replace it later. Document clearly that server restarts lose rooms.

Account creation and authentication should be delegated to Auth0. The frontend will handle Universal Login and receive an access token. The backend must verify that token using Auth0's JSON Web Key Set, which is the published public-key list used to validate signed tokens. Put the required environment variables in `.env.example`: Auth0 domain, audience, client ID, and allowed callback URL. The backend should expose unauthenticated `GET /health` and authenticated room endpoints such as `POST /api/rooms`, `GET /api/rooms/:roomId`, and `POST /api/rooms/:roomId/start`. The exact route list can expand as needed, but room creation, room inspection, and game start must exist.

The websocket layer should be authoritative-server style. Clients do not compute the next game state; they submit an action request containing the room ID, player ID, and requested move. The server verifies the user identity, confirms seat ownership and turn ownership, invokes `applyMove` from `packages/game-engine`, persists the new room state in memory, and broadcasts the resulting state snapshot plus engine events to all room members. Define a small message protocol in `apps/server/src/realtime/protocol.ts` with discriminated union message types for client hello, room subscription, move submission, state sync, error, and presence updates.

Add integration tests for the server using Fastify's inject support for HTTP routes and a websocket test client for the real-time layer. At minimum, prove that unauthorized room creation is rejected, authorized room creation succeeds with the requested target score, invalid game moves are rejected without changing room state, and valid moves broadcast a new synchronized state to connected clients.

Finally, create `apps/web` using Vite, React, and TypeScript. Use React Router for screen navigation and the Auth0 React SDK for login state. Suggested file structure is `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/routes/lobby.tsx`, `apps/web/src/routes/room.tsx`, `apps/web/src/components/board/*`, `apps/web/src/components/moves/*`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/socket.ts`, and `apps/web/src/state/room-store.ts`. The web app does not need an elaborate visual design in the first milestone; correctness and usability come first. It should clearly show bank tokens, visible cards by tier, nobles, player summaries, reserved cards, current turn, target score, and available actions.

The room screen should subscribe to the server's room websocket feed and render the authoritative state. When the local player is active, the UI should derive legal actions from the state returned by the server. To reduce duplicated rules, prefer consuming a legal-move list produced by the server, though the frontend may also use the engine package for optimistic UI hints if desired. Start with no optimism: submit a move, await server confirmation, then rerender using the broadcast state. This is slower but much easier to reason about and debug.

End-to-end validation should include a local two-browser flow. One user logs in, creates a room with target score 18, a second user joins, both connect to the room page, the host starts the game, one player takes tokens, and both pages update to the same visible board state without refresh. The final documentation should describe this exact scenario.

## Concrete Steps

All commands below are run from the repository root, `splendor`, unless a different directory is explicitly named.

1. Initialize git and create the workspace scaffold.

    Run:

        git init
        npm init -y

    Then create the root files described above and edit `package.json` into a workspace-aware root package.

    Expected observable result:

        Initialized empty Git repository in .../splendor/.git/

2. Install baseline development dependencies.

    Run:

        npm install -D typescript eslint @eslint/js typescript-eslint prettier vitest @types/node npm-run-all

    Add frontend and server dependencies later inside the relevant workspaces to keep milestone boundaries clear.

3. Create the engine package and prove it in isolation.

    Run:

        npm install -w packages/game-engine
        npm run test --workspace packages/game-engine
        npm run typecheck --workspace packages/game-engine

    Expected observable result:

        Vitest reports all engine tests passing.
        TypeScript exits with code 0.

4. Create the server app and prove HTTP plus websocket behavior.

    Run:

        npm install -w apps/server fastify @fastify/websocket jose zod dotenv
        npm run test --workspace apps/server
        npm run dev --workspace apps/server

    Expected observable result:

        An HTTP request to http://localhost:3001/health returns status 200 and body {"ok":true}.
        Authenticated room endpoints accept valid bearer tokens and reject missing or invalid ones.

5. Create the web app and prove local interaction.

    Run:

        npm create vite@latest apps/web -- --template react-ts
        npm install -w apps/web
        npm run dev --workspace apps/web

    Expected observable result:

        The browser opens a React app on the configured Vite port.
        After Auth0 configuration is supplied, login succeeds and the lobby page loads.

6. Validate the full stack together.

    Run:

        npm run dev

    Expected observable result:

        The server and client both start.
        Two browser sessions can join the same room and observe the same game state updates.

These commands should be revised as actual scripts are added so the plan always reflects the repository truth.

## Validation and Acceptance

The implementation is complete only when all of the following are true:

Running `npm run lint`, `npm run typecheck`, and `npm run test` at the repository root succeeds.

Running the engine tests proves that setup creates the correct bank counts for two, three, and four players; legal moves exclude impossible actions; purchases correctly consume tokens and apply permanent discounts; nobles are awarded deterministically; reaching the configured target score ends the game at end of round; and no engine function mutates prior state.

Running the server locally exposes `GET /health` without authentication and room routes with authentication. Creating a room with target score 15 or 21 returns room state containing those exact settings. Starting a websocket connection and sending a legal move causes all connected clients in the room to receive the same new state version. Sending an illegal move returns an error message and leaves the room state unchanged.

Running the web app with valid Auth0 configuration allows a user to sign in, create a room, join that room in another browser session, and play at least the opening turns of a game. The interface must visibly show whose turn it is, what the target score is, which moves are available, and the last action result after each server broadcast.

Acceptance for the pure-engine requirement is behavioral, not rhetorical. Tests should prove that state transitions behave correctly across multi-step scenarios such as reserve-plus-discard turns, reserved-card purchases, noble claims, and final-round tie resolution.

## Idempotence and Recovery

Most setup steps are additive and safe to repeat. `npm install` may be run multiple times. Re-running tests and type checks should not alter tracked files. If a dependency choice changes during implementation, update the root workspace configuration and this plan in the same commit.

The main risky step is Auth0 configuration because it depends on external credentials. To keep local development unblocked, implement the server so that missing Auth0 environment variables fail fast with a clear startup error in production-like mode, but allow unit tests to inject mocked verification functions. If local Auth0 setup is unavailable, continue implementing the engine and authenticated route tests with mocks and return to manual login validation once credentials exist.

The websocket layer should be recoverable by reconnecting and requesting a fresh room snapshot. The protocol must therefore include a full-state sync message, not only incremental patches. This makes retries idempotent and simplifies browser refresh behavior.

## Artifacts and Notes

Important implementation artifacts to preserve as the work proceeds:

An example room state JSON snapshot showing bank tokens, visible cards, and player summaries after setup.

An example websocket transcript showing a client move submission followed by a broadcast state update.

An example engine event list for a complex turn that takes tokens, discards to ten, and claims a noble.

An example `.env.example` documenting Auth0 and local development variables without secrets.

When these artifacts become available, include short indented excerpts here so a future contributor can compare their local output.

## Interfaces and Dependencies

Use the following repository structure and exported interfaces unless a later decision log entry explains a necessary change.

In `packages/game-engine/src/types.ts`, define data-first interfaces similar to:

    export type TokenColor = "white" | "blue" | "green" | "red" | "black";
    export type GemColor = TokenColor | "gold";

    export interface GameConfig {
      readonly targetScore: 15 | 16 | 17 | 18 | 19 | 20 | 21;
      readonly seatCount: 2 | 3 | 4;
      readonly deckOrder?: Readonly<{
        tier1: readonly string[];
        tier2: readonly string[];
        tier3: readonly string[];
      }>;
      readonly nobleOrder?: readonly string[];
    }

    export interface GameState {
      readonly config: GameConfig;
      readonly phase: "waiting" | "in_progress" | "finished";
      readonly activePlayerIndex: number;
      readonly round: number;
      readonly bank: Readonly<Record<GemColor, number>>;
      readonly market: Readonly<{
        tier1: readonly Card[];
        tier2: readonly Card[];
        tier3: readonly Card[];
      }>;
      readonly decks: Readonly<{
        tier1: readonly string[];
        tier2: readonly string[];
        tier3: readonly string[];
      }>;
      readonly nobles: readonly Noble[];
      readonly players: readonly PlayerState[];
      readonly history: readonly EngineEvent[];
      readonly result?: GameResult;
    }

    export type Move =
      | { readonly type: "take-distinct"; readonly colors: readonly [TokenColor, TokenColor, TokenColor]; readonly discard?: readonly TokenColor[] }
      | { readonly type: "take-pair"; readonly color: TokenColor; readonly discard?: readonly TokenColor[] }
      | { readonly type: "reserve-visible"; readonly tier: 1 | 2 | 3; readonly cardId: string; readonly discard?: readonly TokenColor[] }
      | { readonly type: "reserve-deck"; readonly tier: 1 | 2 | 3; readonly discard?: readonly TokenColor[] }
      | { readonly type: "purchase-visible"; readonly tier: 1 | 2 | 3; readonly cardId: string; readonly payment: PaymentSelection }
      | { readonly type: "purchase-reserved"; readonly cardId: string; readonly payment: PaymentSelection };

    export interface Engine {
      setupGame: (players: readonly PlayerIdentity[], config: GameConfig) => GameState;
      listLegalMoves: (state: GameState) => readonly Move[];
      applyMove: (state: GameState, move: Move) => EngineResult;
    }

Keep `PaymentSelection` explicit rather than inferring payment server-side from minimal input. That makes validation easier and lets the UI show exactly which gold tokens were spent. The engine should still verify that the supplied payment is legal.

In `apps/server/src/services/room-store.ts`, define an interface similar to:

    export interface RoomStore {
      createRoom: (input: CreateRoomInput) => Promise<RoomRecord>;
      getRoom: (roomId: string) => Promise<RoomRecord | null>;
      updateRoom: (room: RoomRecord) => Promise<void>;
      listJoinableRooms: () => Promise<readonly RoomSummary[]>;
    }

In `apps/server/src/realtime/protocol.ts`, define discriminated union message types similar to:

    export type ClientMessage =
      | { readonly type: "subscribe-room"; readonly roomId: string }
      | { readonly type: "submit-move"; readonly roomId: string; readonly move: Move };

    export type ServerMessage =
      | { readonly type: "room-state"; readonly room: PublicRoomState }
      | { readonly type: "move-applied"; readonly roomId: string; readonly events: readonly EngineEvent[]; readonly stateVersion: number }
      | { readonly type: "error"; readonly code: string; readonly message: string };

In `apps/web/src/state/room-store.ts`, prefer a small client-side store that keeps:

The current authenticated user.

The current room snapshot from the server.

Connection state for the websocket.

Last error and last event list for user feedback.

Dependencies to use:

TypeScript for all code.

Vitest for unit and integration tests.

Fastify and `@fastify/websocket` for backend HTTP and websocket support.

`jose` for JWT verification against Auth0 keys.

React, Vite, React Router, and `@auth0/auth0-react` for the frontend.

Prettier and ESLint for formatting and lint enforcement.

Revision note: Updated this ExecPlan on 2026-03-15 after completing the engine milestone with explicit development-card data, seeded setup helpers, structured move errors, and expanded scenario coverage. The repository continues to pass `npm run lint`, `npm run typecheck`, and `npm run test`.
