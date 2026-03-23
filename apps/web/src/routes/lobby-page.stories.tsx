import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect } from 'react';
import { type ReactNode } from 'react';

import { MockAppAuthProvider, type AppAuthContextValue } from '../lib/auth.js';
import { LobbyPage } from './lobby-page.js';
import { type PublicRoomSummary } from '../lib/types.js';

const mockRooms: readonly PublicRoomSummary[] = [
  {
    id: 'storybook-open-room',
    config: { seatCount: 3, targetScore: 15 },
    hostUserId: 'dev-alice',
    participants: [
      { userId: 'dev-alice', displayName: 'Alice Quartz' },
      { userId: 'dev-bob', displayName: 'Bob Onyx' },
    ],
    stateVersion: 1,
    status: 'waiting',
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'storybook-live-room',
    config: { seatCount: 4, targetScore: 21 },
    hostUserId: 'dev-carmen',
    participants: [
      { userId: 'dev-carmen', displayName: 'Carmen Topaz' },
      { userId: 'dev-diego', displayName: 'Diego Jade' },
      { userId: 'dev-bob', displayName: 'Bob Onyx' },
    ],
    stateVersion: 5,
    status: 'in_progress',
    createdAt: 1,
    updatedAt: 3,
  },
];

const MockLobbyFetch = ({ children }: { readonly children: ReactNode }) => {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.endsWith('/api/rooms')) {
        return new Response(JSON.stringify({ rooms: mockRooms }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled story request.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
};

const baseAuthValue: AppAuthContextValue = {
  getAccessTokenSilently: async () => 'dev:storybook',
  isAuthenticated: true,
  isGuestAuthEnabled: false,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: () => undefined,
  signInAsGuest: () => undefined,
  user: {
    id: 'dev-alice',
    displayName: 'Alice Quartz',
  },
};

const meta = {
  title: 'Routes/LobbyPage',
  component: LobbyPage,
  decorators: [
    (Story) => (
      <MockAppAuthProvider value={baseAuthValue}>
        <MockLobbyFetch>
          <div className="mx-auto max-w-md bg-stone-950 sm:max-w-none">
            <Story />
          </div>
        </MockLobbyFetch>
      </MockAppAuthProvider>
    ),
  ],
} satisfies Meta<typeof LobbyPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GuestEntry: Story = {
  decorators: [
    (Story) => (
      <MockAppAuthProvider
        value={{
          ...baseAuthValue,
          isAuthenticated: false,
          isGuestAuthEnabled: true,
          user: undefined,
        }}
      >
        <MockLobbyFetch>
          <div className="mx-auto max-w-md bg-stone-950 sm:max-w-none">
            <Story />
          </div>
        </MockLobbyFetch>
      </MockAppAuthProvider>
    ),
  ],
};
