import { readWebConfig } from './config.js';
import { type PublicRoomSummary, type RoomConfig, type RoomStatePayload } from './types.js';

const config = readWebConfig();

const createHeaders = (token: string, hasJsonBody: boolean): HeadersInit => ({
  authorization: `Bearer ${token}`,
  ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
});

const requestJson = async <T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> => {
  const hasJsonBody = typeof init?.body === 'string';
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...createHeaders(token, hasJsonBody),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { readonly error?: string }
      | null;

    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
};

export const createRoom = async (
  token: string,
  roomConfig: RoomConfig,
): Promise<RoomStatePayload> => {
  return requestJson<RoomStatePayload>('/api/rooms', token, {
    method: 'POST',
    body: JSON.stringify(roomConfig),
  });
};

export const listRooms = async (): Promise<readonly PublicRoomSummary[]> => {
  const response = await fetch(`${config.apiBaseUrl}/api/rooms`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { readonly error?: string }
      | null;

    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { readonly rooms: readonly PublicRoomSummary[] };
  return payload.rooms;
};

export const loadRoom = async (token: string, roomId: string): Promise<RoomStatePayload> => {
  return requestJson<RoomStatePayload>(
    `/api/rooms/${roomId}`,
    token,
  );
};

export const joinRoom = async (token: string, roomId: string): Promise<RoomStatePayload> => {
  return requestJson<RoomStatePayload>(
    `/api/rooms/${roomId}/join`,
    token,
    {
      method: 'POST',
    },
  );
};

export const startRoom = async (token: string, roomId: string): Promise<RoomStatePayload> => {
  return requestJson<RoomStatePayload>(
    `/api/rooms/${roomId}/start`,
    token,
    {
      method: 'POST',
    },
  );
};

export const bootRoomParticipant = async (
  token: string,
  roomId: string,
  userId: string,
): Promise<RoomStatePayload> => {
  return requestJson<RoomStatePayload>(
    `/api/rooms/${roomId}/boot`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
  );
};
