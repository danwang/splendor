import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MockAppAuthProvider, type AppAuthContextValue } from '../lib/auth.js';
import { RoomPage } from './room-page.js';

const guestAuthValue: AppAuthContextValue = {
  devProfiles: [],
  getAccessTokenSilently: async () => {
    throw new Error('No guest token yet.');
  },
  isAuthenticated: false,
  isDevBypassEnabled: false,
  isGuestAuthEnabled: true,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: () => undefined,
  signInAsGuest: () => undefined,
  signInAsDevProfile: () => undefined,
  user: undefined,
};

const meta = {
  title: 'Routes/RoomPage',
  component: RoomPage,
  decorators: [
    (Story) => (
      <MockAppAuthProvider value={guestAuthValue}>
        <MemoryRouter initialEntries={['/rooms/storybook-room']}>
          <Routes>
            <Route path="/rooms/:roomId" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </MockAppAuthProvider>
    ),
  ],
} satisfies Meta<typeof RoomPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GuestAccess: Story = {};
