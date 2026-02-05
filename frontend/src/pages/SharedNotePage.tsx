import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedContentLayout } from '../components/SharedContentLayout';
import { SharedNoteCard } from '../components/SharedNoteCard';
import { NotAvailableCTA } from '../components/NotAvailableCTA';
import { useToast } from '../hooks/use-toast';
import { Spinner } from '../components/ui/Spinner';
import api, { getApiUrl } from '../lib/api';
import { io, Socket } from 'socket.io-client';

interface SharedNoteData {
  id: number;
  title: string;
  content: string;
  category: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'note';
}

const SharedNotePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [noteData, setNoteData] = useState<SharedNoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  // Store original title for cleanup
  const [originalTitle] = useState(document.title);

  useEffect(() => {
    const fetchSharedNote = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/shared/note/${token}`);
        setNoteData(response.data);
        
        // Set page title
        document.title = `${response.data.title} on Itemize`;
        
        // Set meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.setAttribute('content', 
            `View this note shared from Itemize.cloud. Created by ${response.data.creator_name} on ${new Date(response.data.created_at).toLocaleDateString()}.`
          );
        }
      } catch (err: any) {
        console.error('Error fetching shared note:', err);
        if (err.response?.status === 404) {
          setError('This shared note is no longer available or the link is invalid.');
        } else if (err.response?.status === 429) {
          setError('Too many requests. Please try again later.');
        } else {
          setError('Failed to load shared content. Please try again later.');
        }
        
        // Note: Don't show toast for shared content errors - the main layout handles the error display
      } finally {
        setLoading(false);
      }
    };

    fetchSharedNote();
  }, [token, toast, error]);

  // WebSocket connection effect
  useEffect(() => {
    if (!token || !noteData) return;

    const BACKEND_URL = getApiUrl();
    console.log('Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected, joining shared note:', token);
      setIsConnected(true);
      newSocket.emit('joinSharedNote', token);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setViewerCount(0);
    });

    newSocket.on('joinedSharedNote', (data) => {
      console.log('Successfully joined shared note:', data);
    });

    newSocket.on('viewerCount', (count) => {
      console.log('Viewer count updated:', count);
      setViewerCount(count);
    });

    newSocket.on('noteUpdated', (update) => {
      console.log('Note updated:', update);

      if (update.type === 'noteUpdated' && update.data) {
        // Handle full note updates (legacy)
        setNoteData(prevData => {
          if (!prevData) return prevData;

          return {
            ...prevData,
            title: update.data.title || prevData.title,
            content: update.data.content || prevData.content,
            category: update.data.category || prevData.category,
            color_value: update.data.color_value || prevData.color_value,
            updated_at: update.data.updated_at || prevData.updated_at
          };
        });
      } else if (update.type === 'CONTENT_CHANGED' && update.data) {
        // Handle granular content updates
        setNoteData(prevData => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            content: update.data.content,
            updated_at: update.data.updated_at
          };
        });
      } else if (update.type === 'TITLE_CHANGED' && update.data) {
        // Handle granular title updates
        setNoteData(prevData => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            title: update.data.title,
            updated_at: update.data.updated_at
          };
        });
      } else if (update.type === 'CATEGORY_CHANGED' && update.data) {
        // Handle granular category updates
        setNoteData(prevData => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            category: update.data.category,
            updated_at: update.data.updated_at
          };
        });
      } else if (update.type === 'noteDeleted') {
        console.log('Note was deleted by owner');
        setError('This note has been deleted by the owner.');
        setNoteData(null);
      }
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to real-time updates",
        variant: "destructive",
      });
    });

    setSocket(newSocket);

    return () => {
      console.log('Cleaning up WebSocket connection');
      newSocket.disconnect();
    };
  }, [token, noteData?.id, toast]);

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
        contentType="note"
        onBackToHome={handleBackToHome}
        showCTA={false}
      >
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="brand" />
        </div>
      </SharedContentLayout>
    );
  }

  if (error || !noteData) {
    return (
      <SharedContentLayout
        title="Error"
        contentType="note"
        onBackToHome={handleBackToHome}
        showCTA={false}
        isError={true}
      >
        <NotAvailableCTA
          contentType="note"
          error={error}
          onBackToHome={handleBackToHome}
        />
      </SharedContentLayout>
    );
  }

  return (
    <SharedContentLayout 
      title={noteData.title} 
      contentType="note"
      onBackToHome={handleBackToHome}
    >
      <SharedNoteCard noteData={noteData} isLive={isConnected} />
    </SharedContentLayout>
  );
};

export default SharedNotePage;
