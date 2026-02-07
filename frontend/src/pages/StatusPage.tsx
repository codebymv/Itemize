import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import {
  Server,
  Database,
  Cpu,
  Activity,
  HardDrive,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { Skeleton } from '@/components/ui/skeleton';
import { useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/lib/utils';

interface ServerMemory {
  used: string;
  total: string;
  external: string;
}

interface ServerInfo {
  port: number;
  memory: ServerMemory;
  platform: string;
  nodeVersion: string;
}

interface Services {
  api: string;
  database: string;
  auth: string;
}

interface HealthChecks {
  express: boolean;
  cors: boolean;
  json_parser: boolean;
  database: boolean;
}

interface StatusData {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  server: ServerInfo;
  services: Services;
  healthChecks: HealthChecks;
  endpoints: {
    total: number;
    available: string[];
  };
}

const StatusPage: React.FC = () => {
  const { theme } = useTheme();
  const { setHeaderContent } = useHeader();
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['status']));

  const isDark = theme === 'dark';

  const fetchStatus = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const response = await api.get('/api/status');
      setStatusData(response.data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch status');
      setStatusData(null);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <Server className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-xl font-semibold italic truncate font-raleway text-black dark:text-white">
            STATUS
          </h1>
        </div>
        <Button
          onClick={fetchStatus}
          disabled={isRefreshing}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white font-light whitespace-nowrap"
        >
          {isRefreshing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>
    );
    return () => setHeaderContent(null);
  }, [isRefreshing, setHeaderContent]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'operational':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'degraded':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'error':
      case 'unavailable':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getStatusIcon = (status: string | boolean) => {
    if (typeof status === 'boolean') {
      return status ? (
        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
      );
    }
    
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'operational':
        return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
      case 'error':
      case 'unavailable':
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  const StatusRow = ({ label, status }: { label: string; status: string | boolean }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        {typeof status === 'boolean' ? (
          <Badge className={status ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
            {status ? 'Pass' : 'Fail'}
          </Badge>
        ) : (
          <>
            {getStatusIcon(status)}
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{typeof status === 'string' ? status.charAt(0).toUpperCase() + status.slice(1) : status}</span>
          </>
        )}
      </div>
    </div>
  );

  const ExpandableSection = ({
    id,
    icon: Icon,
    title,
    children,
    isExpanded: isExpandedProp,
  }: {
    id: string;
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
    isExpanded?: boolean;
  }) => {
    const isExpanded = isExpandedProp ?? expandedSections.has(id);
    
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          <div
            className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
            onClick={() => toggleSection(id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
              </div>
              <div className="p-1">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </div>
            </div>
          </div>
          {isExpanded && <div className="border-t border-slate-200 dark:border-slate-800 p-4">{children}</div>}
        </CardContent>
      </Card>
    );
  };

  if (loading && !statusData) {
    return (
      <PageContainer>
        <PageSurface>
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        </PageSurface>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageSurface>
        <div className="space-y-3">
          {error && (
            <Card className="border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium">Error:</span>
                  <span className="text-red-600 dark:text-red-400">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {statusData && (
            <>
              <ExpandableSection id="status" icon={Activity} title="System Status" isExpanded>
                <div className="space-y-3">
                  <StatusRow label="Overall Status" status={statusData.status.charAt(0).toUpperCase() + statusData.status.slice(1)} />
                  <StatusRow label="Environment" status={statusData.environment.toUpperCase()} />
                  <StatusRow label="Version" status={statusData.version} />
                  <StatusRow label="Uptime" status={formatUptime(statusData.uptime)} />
                </div>
              </ExpandableSection>

              <ExpandableSection id="server" icon={Server} title="Server Information">
                <div className="space-y-3">
                  <StatusRow label="Port" status={String(statusData.server.port)} />
                  <StatusRow label="Platform" status={statusData.server.platform} />
                  <StatusRow label="Node.js Version" status={statusData.server.nodeVersion} />
                  <StatusRow label="Memory Used" status={statusData.server.memory.used} />
                  <StatusRow label="Memory Total" status={statusData.server.memory.total} />
                  <StatusRow label="External Memory" status={statusData.server.memory.external} />
                </div>
              </ExpandableSection>

              <ExpandableSection id="services" icon={Activity} title="Services">
                <div className="space-y-3">
                  {Object.entries(statusData.services).map(([service, status]) => (
                    <StatusRow
                      key={service}
                      label={service === 'api' ? 'API' : service === 'auth' ? 'Authentication' : service.charAt(0).toUpperCase() + service.slice(1)}
                      status={status}
                    />
                  ))}
                </div>
              </ExpandableSection>

              <ExpandableSection id="health" icon={CheckCircle} title="Health Checks">
                <div className="space-y-3">
                  {statusData.healthChecks && Object.entries(statusData.healthChecks).map(([check, passed]) => (
                    <StatusRow
                      key={check}
                      label={check === 'express' ? 'Express Server' : check === 'cors' ? 'CORS' : check === 'json_parser' ? 'JSON Parser' : check === 'database' ? 'Database' : check}
                      status={passed}
                    />
                  ))}
                </div>
              </ExpandableSection>

              <ExpandableSection id="endpoints" icon={Database} title="API Endpoints">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Total Available</span>
                    <span className="text-lg font-semibold text-green-600 dark:text-green-400 font-mono">
                      {statusData.endpoints?.total || 0}
                    </span>
                  </div>
                  {statusData.endpoints?.available && statusData.endpoints.available.length > 0 && (
                    <div className="pt-2">
                      <div className="max-h-64 overflow-y-auto space-y-0.5 bg-slate-50 dark:bg-slate-900/30 rounded p-2">
                        {statusData.endpoints.available.map((endpoint, index) => (
                          <div key={index} className="text-xs text-slate-600 dark:text-slate-400 font-mono py-1 px-2 hover:bg-white dark:hover:bg-slate-800 rounded">
                            {endpoint}
                          </div>
                        ))}
                      </div>
                      {statusData.endpoints.total > statusData.endpoints.available.length && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-2">
                          Showing {statusData.endpoints.available.length} of {statusData.endpoints.total} endpoints
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ExpandableSection>

              <div className="text-center py-4">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              </div>
            </>
          )}
        </div>
      </PageSurface>
    </PageContainer>
  );
};

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', className)}>{children}</span>
);

export default StatusPage;