import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('0.0.0.0'),
    AUTH0_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true')
      .default(false),
    AUTH0_DOMAIN: z.string().optional(),
    AUTH0_AUDIENCE: z.string().optional(),
    GUEST_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true')
      .default(false),
  })
  .superRefine((environment, context) => {
    if (!environment.AUTH0_ENABLED) {
      return;
    }

    if (!environment.AUTH0_DOMAIN || environment.AUTH0_DOMAIN.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH0_DOMAIN'],
        message: 'AUTH0_DOMAIN is required when AUTH0_ENABLED=true.',
      });
    }

    if (!environment.AUTH0_AUDIENCE || environment.AUTH0_AUDIENCE.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH0_AUDIENCE'],
        message: 'AUTH0_AUDIENCE is required when AUTH0_ENABLED=true.',
      });
    }
  });

export type ServerConfig = z.infer<typeof envSchema>;

export const readConfig = (environment: NodeJS.ProcessEnv): ServerConfig =>
  envSchema.parse(environment);
