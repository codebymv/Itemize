import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedContentLayout } from '../components/SharedContentLayout';
import { SharedListCard } from '../components/SharedListCard';
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

interface SharedListData {
  id: string;
  title: string;
  category: string;
  items: Array<{
    id: string;
    text: string;
    completed: boolean;
  }>;
  color_value?: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'list';
}

const SharedListPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [listData, setListData] = useState<SharedListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const socketRef = useRef<Socket | null>(null);

  // Store original title for cleanup
  const [originalTitle] = useState(document.title);

  useEffect(() => {
    let unregisterRevocation = () => {};
    let unregisterRecovery = () => {};

    const fetchSharedList = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/shared/list/${token}`);
        setListData(response.data);

        // Set page title
        document.title = `${response.data.title} on Itemize`;

        // Set meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.setAttribute('content',
            `View this list shared from Itemize.cloud. Created by ${response.data.creator_name} on ${new Date(response.data.created_at).toLocaleDateString()}.`
          );
        }

        // Initialize WebSocket connection for real-time updates
        const backendUrl = getApiUrl();
        console.log('Connecting to WebSocket at:', backendUrl);

        const socket = io(backendUrl, {
          transports: ['websocket', 'polling'], // Allow fallback to polling
          timeout: 5000,
          forceNew: true,
          withCredentials: true,
          autoConnect: false,
        });
        socketRef.current = socket;

        const markUnavailable = () => {
          setIsLive(false);
          setError('This shared list is no longer available.');
          setListData(null);
        };
        const recovery = registerSharedRealtimeRecovery(socket, 'list', token, {
          refetch: async () => {
            const latest = await api.get(`/api/shared/list/${token}`);
            setListData(latest.data);
          },
          onLiveChange: (live) => {
            setIsLive(live);
            if (!live) setViewerCount(0);
          },
          onUnavailable: markUnavailable,
          onRecoveryError: () => {
            toast({
              title: "Connection Error",
              description: "Live updates unavailable. Showing last loaded content.",
              variant: "destructive"
            });
          },
        });
        unregisterRecovery = recovery.unregister;

        // Listen for real-time updates
        socket.on('listUpdated', (update) => {
          console.log('Received list update:', update);
          recovery.acceptUpdate(() => {
            setListData(prevData => {
              if (!prevData) return prevData;

              // Update the list data while preserving creator info
              return {
                ...prevData,
                ...update.data,
                creator_name: prevData.creator_name,
                created_at: prevData.created_at,
                type: 'list' as const
              };
            });
          });
        });

        // Listen for viewer count updates
        socket.on('viewerCount', (count: number) => {
          console.log('Viewer count updated:', count);
          setViewerCount(count);
        });

        // Handle connection errors
        socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          toast({
            title: "Connection Error",
            description: "Live updates unavailable. Showing static content.",
            variant: "destructive"
          });
          setIsLive(false);
        });

        // Handle general errors
        socket.on('realtimeError', (error) => {
          console.error('WebSocket error:', error);
        });
        unregisterRevocation = registerSharedContentRevocation(
          socket,
          'list',
          markUnavailable,
        );
        socket.connect();

      } catch (err) {
        console.error('Error fetching shared list:', err);
        const status = getApiStatus(err);
        if (status === 404) {
          setError('This shared list is no longer available or the link is invalid.');
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

    fetchSharedList();

    // Cleanup WebSocket connection on unmount
    return () => {
      unregisterRevocation();
      unregisterRecovery();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token, toast]);

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
        contentType="list"
        onBackToHome={handleBackToHome}
        showCTA={false}
      >
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="brand" />
        </div>
      </SharedContentLayout>
    );
  }

  if (error || !listData) {
    return (
      <SharedContentLayout
        title="Error"
        contentType="list"
        onBackToHome={handleBackToHome}
        showCTA={false}
        isError={true}
      >
        <NotAvailableCTA
          contentType="list"
          error={error}
          onBackToHome={handleBackToHome}
        />
      </SharedContentLayout>
    );
  }

  return (
    <SharedContentLayout
      title={listData.title}
      contentType="list"
      onBackToHome={handleBackToHome}
    >


      <SharedListCard
        listData={listData}
        isLive={isLive}
      />
    </SharedContentLayout>
  );
};

export default SharedListPage;
