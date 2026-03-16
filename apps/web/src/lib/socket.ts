import { readWebConfig } from './config.js';
import { type ClientMessage, type ServerMessage } from './types.js';

const config = readWebConfig();

const createSocketUrl = (roomId: string, token: string): string => {
  if (config.apiBaseUrl.length > 0) {
    const baseUrl = new URL(config.apiBaseUrl);
    const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    return `${protocol}//${baseUrl.host}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${protocol}//${window.location.host}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
};

export const connectToRoomSocket = (
  roomId: string,
  token: string,
  onMessage: (message: ServerMessage) => void,
  onClose: () => void,
): WebSocket => {
  const socket = new WebSocket(createSocketUrl(roomId, token));

  socket.addEventListener('message', (event) => {
    onMessage(JSON.parse(event.data) as ServerMessage);
  });
  socket.addEventListener('close', onClose);

  return socket;
};

export const sendSocketMessage = (socket: WebSocket, message: ClientMessage): void => {
  socket.send(JSON.stringify(message));
};
