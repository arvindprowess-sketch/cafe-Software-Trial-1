import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_PATH = '/api/socket.io';

export type RealtimeMessage = { type: string; data: any };

/**
 * Subscribe to backend real-time events (Socket.IO).
 * Joins the given rooms (e.g. ['kitchen'], ['cashier'], ['admin']) and
 * invokes onMessage for every `update` event. Returns the live connection status.
 */
export function useRealtime(rooms: string[], onMessage: (msg: RealtimeMessage) => void) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;
  const [connected, setConnected] = useState(false);
  const roomKey = rooms.join(',');

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: SOCKET_PATH,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      rooms.forEach((r) => socket.emit('join_room', { room_id: r }));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('update', (msg: RealtimeMessage) => cbRef.current(msg));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  return { connected };
}
