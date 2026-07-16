import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiUrl } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { User } from '@/contexts/AuthContext';
import type { Wireframe } from '@/types';

export function useCanvasWebSocket(currentUser: User | null, onWireframeUpdate: (update: Partial<Wireframe> & { id: number }) => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const currentUserId = currentUser?.uid;

  useEffect(() => {
    if (!currentUserId) return;

    const BACKEND_URL = getApiUrl();
    logger.log('Canvas: Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      withCredentials: true,
      // No explicit auth: backend uses httpOnly cookies automatically
    });

    newSocket.on('connect', () => {
      logger.log('Canvas: WebSocket connected, joining user canvas');
      setIsConnected(true);
      newSocket.emit('joinUserCanvas');
    });

    newSocket.on('disconnect', () => {
      logger.log('Canvas: WebSocket disconnected');
      setIsConnected(false);
    });

    newSocket.on('joinedUserCanvas', () => {
      logger.log('Canvas: Successfully joined user canvas');
    });

    newSocket.on('userWireframeUpdated', (update) => {
      const updated = update?.data;
      if (!updated?.id) return;
      onWireframeUpdate(updated);
    });

    newSocket.on('realtimeError', (error) => {
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
  }, [currentUserId, toast, onWireframeUpdate]);

  return { socket, isConnected };
}
