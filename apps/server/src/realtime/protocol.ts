import { z } from 'zod';

export const clientMessageSchema = z.object({
  type: z.literal('submit-move'),
  move: z.object({ type: z.string() }).passthrough(),
});
