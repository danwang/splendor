import type { Meta, StoryObj } from '@storybook/react-vite';
import { Navigate, Route, Routes } from 'react-router-dom';

import { MockAppAuthProvider, type AppAuthContextValue } from '../lib/auth.js';
import { RoomPage } from './room-page.js';

const guestAuthValue: AppAuthContextValue = {
  getAccessTokenSilently: async () => {
    throw new Error('No guest token yet.');
  },
  isAuthenticated: false,
  isGuestAuthEnabled: true,
  isLoading: false,
  loginWithRedirect: async () => undefined,
  logout: () => undefined,
  signInAsGuest: () => undefined,
  user: undefined,
};

const meta = {
  title: 'Routes/RoomPage',
  component: RoomPage,
  decorators: [
    (Story) => (
      <MockAppAuthProvider value={guestAuthValue}>
        <Routes>
          <Route path="/" element={<Navigate replace to="/rooms/storybook-room" />} />
          <Route path="/rooms/:roomId" element={<Story />} />
        </Routes>
      </MockAppAuthProvider>
    ),
  ],
} satisfies Meta<typeof RoomPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GuestAccess: Story = {};
