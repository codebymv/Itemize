import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiUrl } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { User } from '@/contexts/AuthContext';

export function useCanvasWebSocket(currentUser: User | null, onWireframeUpdate: (update: any) => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!currentUser) return;

    const BACKEND_URL = getApiUrl();
    logger.log('Canvas: Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      // No explicit auth: backend uses httpOnly cookies automatically
    });

    newSocket.on('connect', () => {
      logger.log('Canvas: WebSocket connected, joining user canvas');
      setIsConnected(true);
      newSocket.emit('joinUserCanvas', {});
    });

    newSocket.on('disconnect', () => {
      logger.log('Canvas: WebSocket disconnected');
      setIsConnected(false);
    });

    newSocket.on('joinedUserCanvas', (data) => {
      logger.log('Canvas: Successfully joined user canvas:', data);
      logger.log('Canvas: Sending test ping');
      newSocket.emit('testPing', { message: 'Hello from canvas' });
    });

    newSocket.onAny((eventName, ...args) => {
      logger.log('Canvas: Received WebSocket event:', eventName, args);
    });

    newSocket.on('testPong', (data) => {
      logger.log('Canvas: Received test pong:', data);
    });

    newSocket.on('userWireframeUpdated', (update) => {
      const updated = update?.data;
      if (!updated?.id) return;
      onWireframeUpdate(updated);
    });

    newSocket.on('error', (error) => {
      logger.error('Canvas: WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to real-time updates",
        variant: "destructive",
      });
    });

    newSocket.on('connect_error', (error) => {
      logger.error('Canvas: WebSocket connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      logger.log('Canvas: Cleaning up WebSocket connection');
      newSocket.disconnect();
    };
  }, [currentUser?.uid, toast, onWireframeUpdate]);

  return { socket, isConnected };
}