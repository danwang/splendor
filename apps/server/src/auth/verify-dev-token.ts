import { type AuthenticatedUser, type TokenVerifier } from '../types.js';

const devTokenPattern = /^dev:([^:]+):(.+)$/;

export const createDevTokenVerifier = (): TokenVerifier => {
  return async (token: string): Promise<AuthenticatedUser> => {
    const match = token.match(devTokenPattern);

    if (!match) {
      throw new Error('Invalid development auth token.');
    }

    const id = match[1];
    const encodedName = match[2];

    if (!id || !encodedName) {
      throw new Error('Invalid development auth token.');
    }

    return {
      id,
      displayName: decodeURIComponent(encodedName),
    };
  };
};
