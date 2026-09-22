import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // In production or dev, express and vite share the same origin
    const url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log(`[Socket.IO Client] Connected with id: ${socket?.id}`);
    });

    socket.on('connect_error', (err) => {
      console.warn(`[Socket.IO Client] Connection error:`, err);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO Client] Disconnected: ${reason}`);
    });
  }
  return socket;
};
