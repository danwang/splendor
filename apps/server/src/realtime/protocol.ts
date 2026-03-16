import { z } from 'zod';

export const clientMessageSchema = z.object({
  type: z.literal('submit-move'),
  move: z.unknown(),
});
