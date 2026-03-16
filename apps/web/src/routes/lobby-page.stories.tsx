import type { Meta, StoryObj } from '@storybook/react-vite';

import { MockAppAuthProvider, type AppAuthContextValue } from '../lib/auth.js';
import { LobbyPage } from './lobby-page.js';

const baseAuthValue: AppAuthContextValue = {
  devProfiles: [
    { id: 'dev-alice', displayName: 'Alice Quartz' },
    { id: 'dev-bob', displayName: 'Bob Onyx' },
  ],
  getAccessTokenSilently: async () => 'dev:storybook',
  isAuthenticated: true,
  isDevBypassEnabled: true,
  isGuestAuthEnabled: false,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: () => undefined,
  signInAsGuest: () => undefined,
  signInAsDevProfile: () => undefined,
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
        <div className="mx-auto max-w-md bg-stone-950 sm:max-w-none">
          <Story />
        </div>
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
          isDevBypassEnabled: false,
          isGuestAuthEnabled: true,
          user: undefined,
        }}
      >
        <div className="mx-auto max-w-md bg-stone-950 sm:max-w-none">
          <Story />
        </div>
      </MockAppAuthProvider>
    ),
  ],
};
