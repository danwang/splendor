export interface WebConfig {
  readonly apiBaseUrl: string;
  readonly auth0Enabled: boolean;
  readonly auth0Audience: string;
  readonly auth0ClientId: string;
  readonly auth0Domain: string;
  readonly auth0RedirectUri: string;
  readonly isDevAuthBypassEnabled: boolean;
  readonly isGuestAuthEnabled: boolean;
  readonly isAuthConfigured: boolean;
}

export const readWebConfig = (): WebConfig => {
  const environment = import.meta.env;
  const auth0Enabled = environment.VITE_AUTH0_ENABLED === 'true';
  const auth0Domain = environment.VITE_AUTH0_DOMAIN ?? '';
  const auth0ClientId = environment.VITE_AUTH0_CLIENT_ID ?? '';
  const auth0Audience = environment.VITE_AUTH0_AUDIENCE ?? '';
  const apiBaseUrl = environment.VITE_API_BASE_URL ?? '';
  const isDevAuthBypassEnabled = environment.VITE_DEV_AUTH_BYPASS === 'true';
  const isGuestAuthEnabled = environment.VITE_GUEST_AUTH_ENABLED === 'true';
  const defaultRedirectUri =
    typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.origin;

  return {
    apiBaseUrl,
    auth0Enabled,
    auth0Audience,
    auth0ClientId,
    auth0Domain,
    auth0RedirectUri: environment.VITE_AUTH0_REDIRECT_URI ?? defaultRedirectUri,
    isDevAuthBypassEnabled,
    isGuestAuthEnabled,
    isAuthConfigured:
      !auth0Enabled ||
      isGuestAuthEnabled ||
      isDevAuthBypassEnabled ||
      (auth0Domain.length > 0 && auth0ClientId.length > 0 && auth0Audience.length > 0),
  };
};
