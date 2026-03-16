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

export interface DevUserProfile {
  readonly displayName: string;
  readonly id: string;
}

export interface AppAuthContextValue {
  readonly devProfiles: readonly DevUserProfile[];
  readonly getAccessTokenSilently: () => Promise<string>;
  readonly isAuthenticated: boolean;
  readonly isDevBypassEnabled: boolean;
  readonly isGuestAuthEnabled: boolean;
  readonly isLoading: boolean;
  readonly loginWithRedirect: () => Promise<void>;
  readonly logout: () => void;
  readonly signInAsGuest: (displayName: string) => void;
  readonly signInAsDevProfile: (profileId: string) => void;
  readonly user: AppUser | undefined;
}

const devProfiles = [
  { id: 'dev-alice', displayName: 'Alice Quartz' },
  { id: 'dev-bob', displayName: 'Bob Onyx' },
  { id: 'dev-carmen', displayName: 'Carmen Topaz' },
  { id: 'dev-diego', displayName: 'Diego Jade' },
] as const satisfies readonly DevUserProfile[];

const authContext = createContext<AppAuthContextValue | null>(null);
const devSessionKey = 'splendor.dev-auth-profile';
const guestNameSessionKey = 'splendor.guest-auth-name';
const guestIdSessionKey = 'splendor.guest-auth-id';
const config = readWebConfig();

const createDevToken = (profile: DevUserProfile): string =>
  `dev:${profile.id}:${encodeURIComponent(profile.displayName)}`;

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
      devProfiles,
      getAccessTokenSilently: async () => auth0.getAccessTokenSilently(),
      isAuthenticated: auth0.isAuthenticated,
      isDevBypassEnabled: false,
      isGuestAuthEnabled: false,
      isLoading: auth0.isLoading,
      loginWithRedirect: async () => {
        await auth0.loginWithRedirect();
      },
      logout: () => {
        void auth0.logout({ logoutParams: { returnTo: window.location.origin } });
      },
      signInAsGuest: () => undefined,
      signInAsDevProfile: () => undefined,
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

const DevAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    const savedProfileId = window.sessionStorage.getItem(devSessionKey);

    setProfileId(savedProfileId);
  }, []);

  const selectedProfile = devProfiles.find((profile) => profile.id === profileId);

  const value = useMemo<AppAuthContextValue>(
    () => ({
      devProfiles,
      getAccessTokenSilently: async () => {
        if (!selectedProfile) {
          throw new Error('Select a development player first.');
        }

        return createDevToken(selectedProfile);
      },
      isAuthenticated: selectedProfile !== undefined,
      isDevBypassEnabled: true,
      isGuestAuthEnabled: false,
      isLoading: false,
      loginWithRedirect: async () => {
        if (!selectedProfile) {
          const defaultProfile = devProfiles[0];

          window.sessionStorage.setItem(devSessionKey, defaultProfile.id);
          setProfileId(defaultProfile.id);
        }
      },
      logout: () => {
        window.sessionStorage.removeItem(devSessionKey);
        setProfileId(null);
      },
      signInAsGuest: () => undefined,
      signInAsDevProfile: (nextProfileId: string) => {
        window.sessionStorage.setItem(devSessionKey, nextProfileId);
        setProfileId(nextProfileId);
      },
      user: selectedProfile
        ? createAppUser(selectedProfile.id, selectedProfile.displayName)
        : undefined,
    }),
    [selectedProfile],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
};

const GuestAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  const [guestUser, setGuestUser] = useState<AppUser | undefined>(undefined);

  useEffect(() => {
    const savedName = window.sessionStorage.getItem(guestNameSessionKey)?.trim();
    const savedId = window.sessionStorage.getItem(guestIdSessionKey)?.trim();

    if (savedName && savedId) {
      setGuestUser(createAppUser(savedId, savedName));
    }
  }, []);

  const value = useMemo<AppAuthContextValue>(
    () => ({
      devProfiles,
      getAccessTokenSilently: async () => {
        if (!guestUser) {
          throw new Error('Enter your name first.');
        }

        return createGuestToken(guestUser);
      },
      isAuthenticated: guestUser !== undefined,
      isDevBypassEnabled: false,
      isGuestAuthEnabled: true,
      isLoading: false,
      loginWithRedirect: async () => undefined,
      logout: () => {
        window.sessionStorage.removeItem(guestNameSessionKey);
        window.sessionStorage.removeItem(guestIdSessionKey);
        setGuestUser(undefined);
      },
      signInAsGuest: (displayName: string) => {
        const normalizedName = displayName.trim();

        if (normalizedName.length === 0) {
          return;
        }

        const existingId = window.sessionStorage.getItem(guestIdSessionKey);
        const id = existingId && existingId.length > 0 ? existingId : crypto.randomUUID();

        window.sessionStorage.setItem(guestIdSessionKey, id);
        window.sessionStorage.setItem(guestNameSessionKey, normalizedName);
        setGuestUser(createAppUser(id, normalizedName));
      },
      signInAsDevProfile: () => undefined,
      user: guestUser,
    }),
    [guestUser],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
};

export const AppAuthProvider = ({ children }: { readonly children: ReactNode }) => {
  if (config.isDevAuthBypassEnabled) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }

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
