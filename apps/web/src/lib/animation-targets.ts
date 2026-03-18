import { type CardTier, type GemColor, type TokenColor } from '@splendor/game-engine';

export type AnimationTargetId = string;

export const animationTargets = {
  bankChip: (color: GemColor): AnimationTargetId => `bank:${color}`,
  deck: (tier: CardTier): AnimationTargetId => `deck:${tier}`,
  marketCard: (cardId: string): AnimationTargetId => `market:${cardId}`,
  playerChip: (playerId: string, color: GemColor): AnimationTargetId =>
    `player:${playerId}:chips:${color}`,
  playerNobles: (playerId: string): AnimationTargetId => `player:${playerId}:nobles`,
  playerReserved: (playerId: string): AnimationTargetId => `player:${playerId}:reserved`,
  playerRow: (playerId: string): AnimationTargetId => `player:${playerId}:row`,
  playerScore: (playerId: string): AnimationTargetId => `player:${playerId}:score`,
  playerTableau: (playerId: string): AnimationTargetId => `player:${playerId}:tableau`,
  playerTableauBonus: (playerId: string, color: TokenColor): AnimationTargetId =>
    `player:${playerId}:tableau:${color}`,
  viewportNobleOrigin: (): AnimationTargetId => 'viewport:noble-origin',
} as const;

