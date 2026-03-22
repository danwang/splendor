import { z } from 'zod';

const tokenColor = z.enum(['white', 'blue', 'green', 'red', 'black']);
const gemColor = z.enum(['white', 'blue', 'green', 'red', 'black', 'gold']);
const cardTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const costMap = z.object({
  white: z.number(),
  blue: z.number(),
  green: z.number(),
  red: z.number(),
  black: z.number(),
});

const paymentSelection = z.object({
  tokens: costMap,
  gold: z.number(),
});

const moveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('take-distinct'), colors: z.array(tokenColor) }),
  z.object({ type: z.literal('take-pair'), color: tokenColor }),
  z.object({ type: z.literal('reserve-visible'), cardId: z.string() }),
  z.object({ type: z.literal('reserve-deck'), tier: cardTier }),
  z.object({ type: z.literal('purchase-visible'), cardId: z.string(), payment: paymentSelection }),
  z.object({ type: z.literal('purchase-reserved'), cardId: z.string(), payment: paymentSelection }),
  z.object({ type: z.literal('claim-noble'), nobleId: z.string() }),
  z.object({ type: z.literal('skip-noble') }),
  z.object({ type: z.literal('discard-tokens'), tokens: z.array(gemColor) }),
]);

export const clientMessageSchema = z.object({
  type: z.literal('submit-move'),
  move: moveSchema,
});
