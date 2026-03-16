import 'dotenv/config';

import { createAuth0TokenVerifier } from './auth/verify-auth0-token.js';
import { createGuestTokenVerifier } from './auth/verify-guest-token.js';
import { readConfig } from './config.js';
import { createApp } from './app.js';

const start = async (): Promise<void> => {
  const config = readConfig(process.env);
  const verifyAccessToken =
    !config.AUTH0_ENABLED || config.GUEST_AUTH_ENABLED
      ? createGuestTokenVerifier()
      : createAuth0TokenVerifier(config.AUTH0_DOMAIN!, config.AUTH0_AUDIENCE!);
  const app = await createApp({
    dependencies: {
      verifyAccessToken,
    },
  });

  await app.listen({ host: config.HOST, port: config.PORT });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
