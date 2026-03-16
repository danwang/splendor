import { type GameState, type Move, type SeatCount, type TargetScore } from '@splendor/game-engine';

export interface RoomConfig {
  readonly seatCount: SeatCount;
  readonly targetScore: TargetScore;
}

export interface RoomParticipant {
  readonly userId: string;
  readonly displayName: string;
}

export interface PublicRoomState {
  readonly id: string;
  readonly config: RoomConfig;
  readonly hostUserId: string;
  readonly participants: readonly RoomParticipant[];
  readonly stateVersion: number;
  readonly game: GameState | null;
  readonly status: 'waiting' | 'in_progress' | 'finished';
}

export type ServerMessage =
  | {
      readonly type: 'room-state';
      readonly room: PublicRoomState;
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };

export interface ClientMessage {
  readonly type: 'submit-move';
  readonly move: Move;
}
