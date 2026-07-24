import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import WireframeCanvas from '@/components/WireframeCard/WireframeCanvas';
import { SharedContentLayout } from '@/components/SharedContentLayout';
import { NotAvailableCTA } from '@/components/NotAvailableCTA';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/use-toast';
import api, { getApiUrl } from '@/lib/api';
import {
  registerSharedContentRevocation,
  registerSharedRealtimeRecovery,
} from '@/lib/sharedRealtime';
import type { FlowData } from '@/types';

interface SharedWireframeData {
  id: number;
  title: string;
  category: string;
  flow_data: FlowData;
  width: number;
  height: number;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'wireframe';
}

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

const SharedWireframePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [wireframe, setWireframe] = useState<SharedWireframeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const originalTitle = document.title;
    const load = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }
      try {
        const response = await api.get<SharedWireframeData>(
          `/api/shared/wireframe/${token}`,
        );
        setWireframe(response.data);
        document.title = `${response.data.title} on Itemize`;
      } catch (loadError) {
        const status = statusOf(loadError);
        setError(status === 429
          ? 'Too many requests. Please try again later.'
          : status === 404
            ? 'This shared wireframe is no longer available or the link is invalid.'
            : 'Failed to load shared content. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => {
      document.title = originalTitle;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !wireframe?.id) return;
    const socket: Socket = io(getApiUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20_000,
      withCredentials: true,
      autoConnect: false,
    });
    const markUnavailable = () => {
      setIsConnected(false);
      setError('This shared wireframe is no longer available.');
      setWireframe(null);
    };
    const recovery = registerSharedRealtimeRecovery(
      socket,
      'wireframe',
      token,
      {
        refetch: async () => {
          const latest = await api.get<SharedWireframeData>(
            `/api/shared/wireframe/${token}`,
          );
          setWireframe(latest.data);
        },
        onLiveChange: setIsConnected,
        onUnavailable: markUnavailable,
        onRecoveryError: () => {
          toast({
            title: 'Connection Error',
            description: 'Live updates unavailable. Showing last loaded content.',
            variant: 'destructive',
          });
        },
      },
    );
    socket.on('wireframeUpdated', (update) => {
      recovery.acceptUpdate(() => {
        if (update?.type === 'wireframeDeleted') {
          setError('This wireframe has been deleted by the owner.');
          setWireframe(null);
          return;
        }
        if (update?.type === 'wireframeUpdated' && update.data) {
          setWireframe((current) => current
            ? {
                ...current,
                title: update.data.title ?? current.title,
                category: update.data.category ?? current.category,
                flow_data: update.data.flow_data ?? current.flow_data,
                color_value:
                  update.data.color_value ?? current.color_value,
                updated_at: update.data.updated_at ?? current.updated_at,
              }
            : current);
        }
      });
    });
    const unregisterRevocation = registerSharedContentRevocation(
      socket,
      'wireframe',
      markUnavailable,
    );
    socket.connect();
    return () => {
      unregisterRevocation();
      recovery.unregister();
      socket.disconnect();
    };
  }, [token, wireframe?.id, toast]);

  const back = () => navigate('/');
  if (loading) {
    return (
      <SharedContentLayout
        title="Loading..."
        contentType="wireframe"
        onBackToHome={back}
        showCTA={false}
      >
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="brand" />
        </div>
      </SharedContentLayout>
    );
  }
  if (error || !wireframe) {
    return (
      <SharedContentLayout
        title="Error"
        contentType="wireframe"
        onBackToHome={back}
        showCTA={false}
        isError
      >
        <NotAvailableCTA
          contentType="wireframe"
          error={error ?? undefined}
          onBackToHome={back}
        />
      </SharedContentLayout>
    );
  }
  return (
    <SharedContentLayout
      title={wireframe.title}
      contentType="wireframe"
      onBackToHome={back}
    >
      <div className="rounded-lg border bg-background p-4 text-left shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{wireframe.title}</h1>
            <p className="text-sm text-muted-foreground">
              {wireframe.category} · shared by {wireframe.creator_name}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Live' : 'Static'}
          </span>
        </div>
        <WireframeCanvas
          flowData={wireframe.flow_data}
          readOnly
          height={Math.min(Math.max(wireframe.height || 600, 400), 800)}
        />
      </div>
    </SharedContentLayout>
  );
};

export default SharedWireframePage;
