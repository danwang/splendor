import { type AuthenticatedUser } from '../types.js';

export const createGuestTokenVerifier = () => async (
  token: string,
): Promise<AuthenticatedUser> => {
  const match = token.match(/^guest:([^:]+):(.+)$/);

  if (!match) {
    throw new Error('Invalid guest auth token.');
  }

  const encodedId = match[1];
  const encodedDisplayName = match[2];

  if (!encodedId || !encodedDisplayName) {
    throw new Error('Invalid guest auth token.');
  }

  const id = decodeURIComponent(encodedId);
  const displayName = decodeURIComponent(encodedDisplayName).trim();

  if (id.length === 0 || displayName.length === 0) {
    throw new Error('Invalid guest auth token.');
  }

  return {
    id,
    displayName,
  };
};
