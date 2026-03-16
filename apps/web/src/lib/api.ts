import { readWebConfig } from './config.js';
import { type PublicRoomState, type RoomConfig } from './types.js';

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
): Promise<PublicRoomState> => {
  const payload = await requestJson<{ readonly room: PublicRoomState }>('/api/rooms', token, {
    method: 'POST',
    body: JSON.stringify(roomConfig),
  });

  return payload.room;
};

export const loadRoom = async (token: string, roomId: string): Promise<PublicRoomState> => {
  const payload = await requestJson<{ readonly room: PublicRoomState }>(
    `/api/rooms/${roomId}`,
    token,
  );

  return payload.room;
};

export const joinRoom = async (token: string, roomId: string): Promise<PublicRoomState> => {
  const payload = await requestJson<{ readonly room: PublicRoomState }>(
    `/api/rooms/${roomId}/join`,
    token,
    {
      method: 'POST',
    },
  );

  return payload.room;
};

export const startRoom = async (token: string, roomId: string): Promise<PublicRoomState> => {
  const payload = await requestJson<{ readonly room: PublicRoomState }>(
    `/api/rooms/${roomId}/start`,
    token,
    {
      method: 'POST',
    },
  );

  return payload.room;
};
