import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { readWebConfig } from './config.js';

export interface AppUser {
  readonly displayName: string;
  readonly email?: string;
  readonly id: string;
}

export interface AppAuthContextValue {
  readonly getAccessTokenSilently: () => Promise<string>;
  readonly isAuthenticated: boolean;
  readonly isGuestAuthEnabled: boolean;
  readonly isLoading: boolean;
  readonly loginWithRedirect: () => Promise<void>;
  readonly logout: () => void;
  readonly signInAsGuest: (displayName: string) => void;
  readonly user: AppUser | undefined;
}

const authContext = createContext<AppAuthContextValue | null>(null);
const guestNameStorageKey = 'splendor.guest-auth-name';
const guestIdStorageKey = 'splendor.guest-auth-id';
const config = readWebConfig();

const createAppUser = (
  id: string,
  displayName: string,
  email?: string,
): AppUser => ({
  id,
  displayName,
  ...(email ? { email } : {}),
});

const createGuestToken = (user: AppUser): string =>
  `guest:${encodeURIComponent(user.id)}:${encodeURIComponent(user.displayName)}`;

const useAuth0Adapter = (): AppAuthContextValue => {
  const auth0 = useAuth0();

  return useMemo(
    () => ({
      getAccessTokenSilently: async () => auth0.getAccessTokenSilently(),
      isAuthenticated: auth0.isAuthenticated,
      isGuestAuthEnabled: false,
      isLoading: auth0.isLoading,
      loginWithRedirect: async () => {
        await auth0.loginWithRedirect();
      },
      logout: () => {
        void auth0.logout({ logoutParams: { returnTo: window.location.origin } });
      },
      signInAsGuest: () => undefined,
      user: auth0.user?.sub
        ? createAppUser(
            auth0.user.sub,
            auth0.user.name ?? auth0.user.nickname ?? auth0.user.email ?? auth0.user.sub,
            auth0.user.email,
          )
        : undefined,
    }),
    [auth0],
  );
};

const Auth0AppAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  const value = useAuth0Adapter();

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
};

const GuestAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  const [guestUser, setGuestUser] = useState<AppUser | undefined>(undefined);

  useEffect(() => {
    const savedName = window.localStorage.getItem(guestNameStorageKey)?.trim();
    const savedId = window.localStorage.getItem(guestIdStorageKey)?.trim();

    if (savedName && savedId) {
      setGuestUser(createAppUser(savedId, savedName));
    }
  }, []);

  const value = useMemo<AppAuthContextValue>(
    () => ({
      getAccessTokenSilently: async () => {
        if (!guestUser) {
          throw new Error('Enter your name first.');
        }

        return createGuestToken(guestUser);
      },
      isAuthenticated: guestUser !== undefined,
      isGuestAuthEnabled: true,
      isLoading: false,
      loginWithRedirect: async () => undefined,
      logout: () => {
        window.localStorage.removeItem(guestNameStorageKey);
        window.localStorage.removeItem(guestIdStorageKey);
        setGuestUser(undefined);
      },
      signInAsGuest: (displayName: string) => {
        const normalizedName = displayName.trim();

        if (normalizedName.length === 0) {
          return;
        }

        const existingId = window.localStorage.getItem(guestIdStorageKey);
        const id = existingId && existingId.length > 0 ? existingId : crypto.randomUUID();

        window.localStorage.setItem(guestIdStorageKey, id);
        window.localStorage.setItem(guestNameStorageKey, normalizedName);
        setGuestUser(createAppUser(id, normalizedName));
      },
      user: guestUser,
    }),
    [guestUser],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
};

export const AppAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  if (!config.auth0Enabled || config.isGuestAuthEnabled) {
    return <GuestAuthProvider>{children}</GuestAuthProvider>;
  }

  return (
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      authorizationParams={{
        audience: config.auth0Audience,
        redirect_uri: config.auth0RedirectUri,
      }}
    >
      <Auth0AppAuthProvider>{children}</Auth0AppAuthProvider>
    </Auth0Provider>
  );
};

export const useAppAuth = (): AppAuthContextValue => {
  const value = useContext(authContext);

  if (!value) {
    throw new Error('useAppAuth must be used inside AppAuthProvider.');
  }

  return value;
};

export const MockAppAuthProvider = ({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: AppAuthContextValue;
}) => <authContext.Provider value={value}>{children}</authContext.Provider>;
