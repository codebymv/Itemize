import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiUrl } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { List, Note, Wireframe } from '@/types';

export function useCanvasWebSocket(token: string | null, onWireframeUpdate: (update: any) => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) return;

    const BACKEND_URL = getApiUrl();
    logger.log('Canvas: Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      auth: {
        token,
      },
    });

    newSocket.on('connect', () => {
      logger.log('Canvas: WebSocket connected, joining user canvas');
      setIsConnected(true);
      newSocket.emit('joinUserCanvas', { token });
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
      
      if (error?.details === 'jwt expired' || error?.message?.includes('jwt expired')) {
        logger.log('Canvas: JWT expired, will reconnect after token refresh');
      } else {
        toast({
          title: "Connection Error",
          description: error.message || "Failed to connect to real-time updates",
          variant: "destructive",
        });
      }
    });

    newSocket.on('connect_error', (error) => {
      logger.error('Canvas: WebSocket connection error:', error);
      if (error.message?.includes('jwt expired') || error.message?.includes('unauthorized')) {
        logger.log('Canvas: Auth error, waiting for token refresh...');
        setIsConnected(false);
      }
    });

    setSocket(newSocket);

    const handleTokenRefresh = (event: CustomEvent) => {
      const newToken = event.detail?.token;
      logger.log('Canvas: Token refreshed, reconnecting WebSocket...');
      
      newSocket.disconnect();
      newSocket.auth = { token: newToken };
      newSocket.connect();
      
      toast({
        title: "Connection Restored",
        description: "Your session has been refreshed.",
      });
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefresh as EventListener);

    return () => {
      logger.log('Canvas: Cleaning up WebSocket connection');
      window.removeEventListener('auth:token-refreshed', handleTokenRefresh as EventListener);
      newSocket.disconnect();
    };
  }, [token, toast, onWireframeUpdate]);

  return { socket, isConnected };
}