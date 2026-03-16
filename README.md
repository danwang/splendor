# Splendor

TypeScript monorepo for a multiplayer web implementation of Splendor.

## Workspace layout

- `packages/game-engine`: Pure functional Splendor rules engine.
- `apps/server`: Fastify/Auth0/guest/websocket multiplayer server.
- `apps/web`: React + Tailwind frontend.
- `plans/`: Execution plans and design notes.

## Commands

- `npm run build`
- `npm run dev`
- `npm run start`
- `npm run dev:storybook`
- `npm run build:storybook`
- `npm run typecheck`
- `npm run test`
- `npm run dev:server`
- `npm run dev:web`
- `npm run format`

## Environment

Copy values from `.env.example`.

- Server:
  - `AUTH0_ENABLED`
  - `AUTH0_DOMAIN`
  - `AUTH0_AUDIENCE`
  - `GUEST_AUTH_ENABLED`
  - `PORT`
  - `HOST`
- Frontend build:
  - `VITE_AUTH0_ENABLED`
  - `VITE_AUTH0_DOMAIN`
  - `VITE_AUTH0_CLIENT_ID`
  - `VITE_AUTH0_AUDIENCE`
  - `VITE_AUTH0_REDIRECT_URI`
  - `VITE_GUEST_AUTH_ENABLED`
  - `VITE_API_BASE_URL`

Auth0 is off by default. For guest-name deployment without Auth0, you do not need to set any Auth0 variables.

Optional explicit guest config:

```env
GUEST_AUTH_ENABLED=true
VITE_GUEST_AUTH_ENABLED=true
```

In that mode, players can enter a display name and play without signing up.

If you want Auth0 instead, explicitly enable it:

```env
AUTH0_ENABLED=true
VITE_AUTH0_ENABLED=true
AUTH0_DOMAIN=...
AUTH0_AUDIENCE=...
VITE_AUTH0_DOMAIN=...
VITE_AUTH0_CLIENT_ID=...
VITE_AUTH0_AUDIENCE=...
```

## Local Development

- `npm run dev`
  - runs the game-engine build watch, the Fastify server, and the Vite frontend
  - Vite proxies `/api`, `/health`, and `/ws` to the local server

## Single-Service Deploy

- `npm run build`
  - builds the engine, then the web app, then the server
- `npm run start`
  - starts the Fastify server
  - if `apps/web/dist` exists, the server also serves the built frontend and SPA fallback routes

This is the intended shape for platforms like Render: one build command and one start command, with the frontend served by the backend process.

## Storybook

- `npm run dev:storybook`
  - starts Storybook for the web workspace on port `6006`
- `npm run build:storybook`
  - builds a static Storybook bundle under `apps/web/storybook-static`

The initial stories render the Splendor room UI in several useful states, including:
- waiting lobby
- opening turn
- discard phase
- noble choice
- finished game
