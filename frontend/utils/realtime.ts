import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const SOCKET_PATH = '/api/socket.io';

/**
 * Subscribe to backend real-time events on the customer app.
 * Auto-joins the "customers" room (for menu/stock updates) and the user's
 * private room "user:<id>" (for live order-status updates).
 */
export function useRealtime(onMessage: (msg: { type: string; data: any }) => void, extraRooms: string[] = []) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;
  const socketRef = useRef<Socket | null>(null);
  const roomKey = extraRooms.join(',');

  useEffect(() => {
    if (!BACKEND_URL) return;
    let cancelled = false;

    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const joinRooms = async () => {
      const rooms = ['customers', ...extraRooms];
      try {
        const raw = await AsyncStorage.getItem('user_data');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.id) rooms.push(`user:${u.id}`);
        }
      } catch {}
      if (cancelled) return;
      rooms.forEach((r) => socket.emit('join_room', { room_id: r }));
    };

    socket.on('connect', joinRooms);
    socket.on('update', (msg) => cbRef.current(msg));

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  return socketRef;
}
