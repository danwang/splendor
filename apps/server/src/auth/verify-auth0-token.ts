import { createRemoteJWKSet, jwtVerify } from 'jose';

import { type AuthenticatedUser, type TokenVerifier } from '../types.js';

const parseDisplayName = (claims: Record<string, unknown>, fallbackUserId: string): string => {
  const candidates = [claims.name, claims.nickname, claims.email, fallbackUserId];
  const match = candidates.find((value): value is string => {
    return typeof value === 'string' && value.length > 0;
  });

  return match ?? fallbackUserId;
};

export const createAuth0TokenVerifier = (
  domain: string,
  audience: string,
): TokenVerifier => {
  const jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));

  return async (token: string): Promise<AuthenticatedUser> => {
    const verification = await jwtVerify(token, jwks, {
      issuer: `https://${domain}/`,
      audience,
    });
    const subject = verification.payload.sub;

    if (!subject) {
      throw new Error('Verified token is missing sub claim.');
    }

    const claims = verification.payload as Record<string, unknown>;

    return {
      id: subject,
      displayName: parseDisplayName(claims, subject),
    };
  };
};
