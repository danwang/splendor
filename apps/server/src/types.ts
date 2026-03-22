import { type GameState, type Move, type SeatCount, type TargetScore } from '@splendor/game-engine';

export interface AuthenticatedUser {
  readonly id: string;
  readonly displayName: string;
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

export interface RoomConfig {
  readonly seatCount: SeatCount;
  readonly targetScore: TargetScore;
}

export interface RoomParticipant {
  readonly userId: string;
  readonly displayName: string;
}

export interface RoomRecord {
  readonly createdAt: number;
  readonly id: string;
  readonly config: RoomConfig;
  readonly hostUserId: string;
  readonly participants: readonly RoomParticipant[];
  readonly stateVersion: number;
  readonly game: GameState | null;
  readonly history: readonly PublicRoomState[];
  readonly updatedAt: number;
}

export interface PublicRoomState {
  readonly id: string;
  readonly config: RoomConfig;
  readonly connectedUserIds: readonly string[];
  readonly hostUserId: string;
  readonly participants: readonly RoomParticipant[];
  readonly stateVersion: number;
  readonly game: GameState | null;
  readonly status: 'waiting' | 'in_progress' | 'finished';
}

export interface PublicRoomSummary {
  readonly id: string;
  readonly config: RoomConfig;
  readonly hostUserId: string;
  readonly participants: readonly RoomParticipant[];
  readonly stateVersion: number;
  readonly status: 'waiting' | 'in_progress' | 'finished';
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type ClientMessage =
  | {
      readonly type: 'submit-move';
      readonly move: Move;
    }
  | {
      readonly type: 'resign';
    };

export type ServerMessage =
  | {
      readonly type: 'room-state';
      readonly room: PublicRoomState;
      readonly roomHistory: readonly PublicRoomState[];
    }
  | {
      readonly type: 'error';
      readonly message: string;
    };

export interface CreateRoomInput {
  readonly host: AuthenticatedUser;
  readonly config: RoomConfig;
}

export interface ServerDependencies {
  readonly verifyAccessToken: TokenVerifier;
  readonly roomStore: RoomStore;
  readonly makeSeed: () => string;
}

export interface RoomStore {
  readonly createRoom: (input: CreateRoomInput) => Promise<RoomRecord>;
  readonly getRoom: (roomId: string) => Promise<RoomRecord | null>;
  readonly listRooms: () => Promise<readonly RoomRecord[]>;
  readonly deleteRoom: (roomId: string) => Promise<void>;
  readonly updateRoom: (room: RoomRecord) => Promise<void>;
  readonly close?: () => Promise<void> | void;
}
