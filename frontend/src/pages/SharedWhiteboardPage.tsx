import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedContentLayout } from '../components/SharedContentLayout';
import { SharedWhiteboardCard } from '../components/SharedWhiteboardCard';
import { NotAvailableCTA } from '../components/NotAvailableCTA';
import { useToast } from '../hooks/use-toast';
import { Spinner } from '../components/ui/Spinner';
import api, { getApiUrl } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import {
  registerSharedContentRevocation,
  registerSharedRealtimeRecovery,
} from '../lib/sharedRealtime';

const getApiStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

interface SharedWhiteboardData {
  id: number;
  title: string;
  category: string;
  canvas_data: unknown;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'whiteboard';
}

const SharedWhiteboardPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [whiteboardData, setWhiteboardData] = useState<SharedWhiteboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const sharedWhiteboardId = whiteboardData?.id;

  // Store original title for cleanup
  const [originalTitle] = useState(document.title);

  useEffect(() => {
    const fetchSharedWhiteboard = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/shared/whiteboard/${token}`);
        setWhiteboardData(response.data);
        
        // Set page title
        document.title = `${response.data.title} on Itemize`;
        
        // Set meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.setAttribute('content', 
            `View this whiteboard shared from Itemize.cloud. Created by ${response.data.creator_name} on ${new Date(response.data.created_at).toLocaleDateString()}.`
          );
        }
      } catch (err) {
        console.error('Error fetching shared whiteboard:', err);
        const status = getApiStatus(err);
        if (status === 404) {
          setError('This shared whiteboard is no longer available or the link is invalid.');
        } else if (status === 429) {
          setError('Too many requests. Please try again later.');
        } else {
          setError('Failed to load shared content. Please try again later.');
        }
        
        // Note: Don't show toast for shared content errors - the main layout handles the error display
      } finally {
        setLoading(false);
      }
    };

    fetchSharedWhiteboard();
  }, [token, toast]);

  // WebSocket connection effect
  useEffect(() => {
    if (!token || !sharedWhiteboardId) return;

    const BACKEND_URL = getApiUrl();
    console.log('Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      withCredentials: true,
      autoConnect: false,
    });

    const markUnavailable = () => {
      setIsConnected(false);
      setError('This shared whiteboard is no longer available.');
      setWhiteboardData(null);
    };
    const recovery = registerSharedRealtimeRecovery(newSocket, 'whiteboard', token, {
      refetch: async () => {
        const latest = await api.get(`/api/shared/whiteboard/${token}`);
        setWhiteboardData(latest.data);
      },
      onLiveChange: (live) => {
        setIsConnected(live);
        if (!live) setViewerCount(0);
      },
      onUnavailable: markUnavailable,
      onRecoveryError: () => {
        toast({
          title: "Connection Error",
          description: "Live updates unavailable. Showing last loaded content.",
          variant: "destructive",
        });
      },
    });

    newSocket.on('viewerCount', (count) => {
      console.log('Viewer count updated:', count);
      setViewerCount(count);
    });

    newSocket.on('whiteboardUpdated', (update) => {
      console.log('Whiteboard updated:', update);

      recovery.acceptUpdate(() => {
        if (update.type === 'whiteboardUpdated' && update.data) {
          setWhiteboardData(prevData => {
            if (!prevData) return prevData;

            return {
              ...prevData,
              title: update.data.title || prevData.title,
              category: update.data.category || prevData.category,
              canvas_data: update.data.canvas_data || prevData.canvas_data,
              canvas_width: update.data.canvas_width || prevData.canvas_width,
              canvas_height: update.data.canvas_height || prevData.canvas_height,
              background_color: update.data.background_color || prevData.background_color,
              color_value: update.data.color_value || prevData.color_value,
              updated_at: update.data.updated_at || prevData.updated_at
            };
          });
        } else if (update.type === 'whiteboardDeleted') {
          console.log('Whiteboard was deleted by owner');
          setError('This whiteboard has been deleted by the owner.');
          setWhiteboardData(null);
        }
      });
    });

    newSocket.on('realtimeError', (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to real-time updates",
        variant: "destructive",
      });
    });
    const unregisterRevocation = registerSharedContentRevocation(
      newSocket,
      'whiteboard',
      markUnavailable,
    );

    setSocket(newSocket);
    newSocket.connect();

    return () => {
      console.log('Cleaning up WebSocket connection');
      unregisterRevocation();
      recovery.unregister();
      newSocket.disconnect();
    };
  }, [token, sharedWhiteboardId, toast]);

  // Cleanup title on unmount
  useEffect(() => {
    return () => {
      document.title = originalTitle;
    };
  }, [originalTitle]);

  const handleBackToHome = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <SharedContentLayout
        title="Loading..."
        contentType="whiteboard"
        onBackToHome={handleBackToHome}
        showCTA={false}
      >
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="brand" />
        </div>
      </SharedContentLayout>
    );
  }

  if (error || !whiteboardData) {
    return (
      <SharedContentLayout
        title="Error"
        contentType="whiteboard"
        onBackToHome={handleBackToHome}
        showCTA={false}
        isError={true}
      >
        <NotAvailableCTA
          contentType="whiteboard"
          error={error}
          onBackToHome={handleBackToHome}
        />
      </SharedContentLayout>
    );
  }

  return (
    <SharedContentLayout 
      title={whiteboardData.title} 
      contentType="whiteboard"
      onBackToHome={handleBackToHome}
    >
      <SharedWhiteboardCard whiteboardData={whiteboardData} isLive={isConnected} />
    </SharedContentLayout>
  );
};

export default SharedWhiteboardPage;
