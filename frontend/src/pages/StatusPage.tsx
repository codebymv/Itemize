import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import { 
  Server, 
  Database, 
  Activity, 
  Clock, 
  HardDrive, 
  Cpu, 
  Network,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import BackgroundClouds from '@/components/ui/BackgroundClouds';

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
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const isLight = theme === 'light';

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/status');
      setStatusData(response.data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch status');
      setStatusData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'unhealthy':
      case 'error':
      case 'unavailable':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'operational':
        return 'text-green-500';
      case 'unhealthy':
      case 'error':
      case 'unavailable':
        return 'text-red-500';
      case 'degraded':
        return 'text-yellow-500';
      default:
        return 'text-yellow-500';
    }
  };

  const formatServiceName = (service: string) => {
    switch (service.toLowerCase()) {
      case 'api':
        return 'API';
      case 'database':
        return 'Database';
      case 'auth':
        return 'Authentication';
      default:
        return service.charAt(0).toUpperCase() + service.slice(1);
    }
  };

  const formatStatusValue = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatHealthCheckName = (check: string) => {
    switch (check.toLowerCase()) {
      case 'express':
        return 'Express Server';
      case 'cors':
        return 'CORS';
      case 'json_parser':
        return 'JSON Parser';
      case 'database':
        return 'Database Connection';
      default:
        return check.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  if (loading && !statusData) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 relative overflow-hidden">
        {/* Background Clouds */}
        <BackgroundClouds opacity={isLight ? 0.2 : 0.15} cloudCount={12} isLight={isLight} />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p>Loading backend status...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 force-raleway relative overflow-hidden">
      {/* Background Clouds */}
      <BackgroundClouds opacity={isLight ? 0.2 : 0.15} cloudCount={12} isLight={isLight} />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Server className="w-8 h-8 mr-3 text-blue-600" />
              <h1 className="text-3xl font-bold">System Status</h1>
            </div>
            <Button
              onClick={fetchStatus}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-normal flex items-center"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Activity className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
          <p className="text-muted-foreground">
            Real-time status and health information for itemize.cloud services
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="p-4">
              <div className="flex items-center text-red-700 dark:text-red-300">
                <XCircle className="w-5 h-5 mr-2" />
                <span className="font-medium">Error fetching status:</span>
              </div>
              <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {statusData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Overall Status */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center">
                  <Server className="w-5 h-5 mr-2 text-blue-600" />
                  <CardTitle className="text-lg font-semibold">Overall Status</CardTitle>
                </div>
                {getStatusIcon(statusData.status)}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`font-medium ${getStatusColor(statusData.status)}`}>
                    {formatStatusValue(statusData.status)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Environment:</span>
                  <span className="font-medium">{formatStatusValue(statusData.environment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version:</span>
                  <span className="font-medium">{statusData.version}</span>
                </div>
              </CardContent>
            </Card>

            {/* Server Info */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <Cpu className="w-5 h-5 mr-2 text-blue-600" />
                <CardTitle className="text-lg font-semibold">Server Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Port:</span>
                  <span className="font-medium">{statusData.server.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform:</span>
                  <span className="font-medium">{statusData.server.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Node.js:</span>
                  <span className="font-medium">{statusData.server.nodeVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime:</span>
                  <span className="font-medium">{formatUptime(statusData.uptime)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Memory Usage */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <HardDrive className="w-5 h-5 mr-2 text-blue-600" />
                <CardTitle className="text-lg font-semibold">Memory Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used:</span>
                  <span className="font-medium">{statusData.server.memory.used}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">{statusData.server.memory.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">External:</span>
                  <span className="font-medium">{statusData.server.memory.external}</span>
                </div>
              </CardContent>
            </Card>

            {/* Services Status */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <Network className="w-5 h-5 mr-2 text-blue-600" />
                <CardTitle className="text-lg font-semibold">Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(statusData.services).map(([service, status]) => (
                  <div key={service} className="flex justify-between">
                    <span className="text-muted-foreground">{formatServiceName(service)}:</span>
                    <div className="flex items-center">
                      {getStatusIcon(status)}
                      <span className={`ml-2 font-medium ${getStatusColor(status)}`}>
                        {formatStatusValue(status)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Health Checks */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <CheckCircle className="w-5 h-5 mr-2 text-blue-600" />
                <CardTitle className="text-lg font-semibold">Health Checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(statusData.healthChecks).map(([check, status]) => (
                  <div key={check} className="flex justify-between">
                    <span className="text-muted-foreground">{formatHealthCheckName(check)}:</span>
                    <div className="flex items-center">
                      {status ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className={`ml-2 font-medium ${status ? 'text-green-500' : 'text-red-500'}`}>
                        {status ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* API Endpoints */}
            <Card>
              <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <Database className="w-5 h-5 mr-2 text-blue-600" />
                <CardTitle className="text-lg font-semibold">API Endpoints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between mb-3">
                  <span className="text-muted-foreground">Total Available:</span>
                  <span className="font-medium text-green-500">{statusData.endpoints.total}</span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {statusData.endpoints.available.map((endpoint, index) => (
                    <div key={index} className="text-sm text-muted-foreground py-1">
                      {endpoint}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusPage;
