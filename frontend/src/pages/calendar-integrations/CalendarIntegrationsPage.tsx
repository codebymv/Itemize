import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Link2, Plus, Search, RefreshCw, Trash2, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { 
    getCalendarConnections, 
    disconnectCalendar, 
    syncCalendar, 
    initiateGoogleAuth 
} from '@/services/calendarIntegrationsApi';

interface CalendarConnection {
    id: number;
    provider: string;
    email: string;
    is_active: boolean;
    sync_enabled: boolean;
    last_synced_at?: string;
    created_at: string;
}

export function CalendarIntegrationsPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [connections, setConnections] = useState<CalendarConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [syncing, setSyncing] = useState<number | null>(null);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <Link2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SCHEDULING | Integrations
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={handleConnectGoogle}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Connect Calendar
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error: any) {
                setInitError('Failed to initialize.');
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchConnections = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await getCalendarConnections(organizationId);
            setConnections(response.connections || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load connections', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchConnections();
    }, [fetchConnections]);

    const handleConnectGoogle = async () => {
        if (!organizationId) return;
        try {
            const { authUrl } = await initiateGoogleAuth(organizationId);
            window.location.href = authUrl;
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to initiate connection', variant: 'destructive' });
        }
    };

    const handleSync = async (id: number) => {
        if (!organizationId) return;
        setSyncing(id);
        try {
            await syncCalendar(id, organizationId);
            toast({ title: 'Sync Complete', description: 'Calendar synced successfully' });
            fetchConnections();
        } catch (error) {
            toast({ title: 'Error', description: 'Sync failed', variant: 'destructive' });
        } finally {
            setSyncing(null);
        }
    };

    const handleDisconnect = async (id: number) => {
        if (!organizationId) return;
        try {
            await disconnectCalendar(id, organizationId);
            setConnections(prev => prev.filter(c => c.id !== id));
            toast({ title: 'Disconnected', description: 'Calendar disconnected successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
        }
    };

    if (initError) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
                <Card className="max-w-lg mx-auto mt-12">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">{initError}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-light flex-1"
                    onClick={handleConnectGoogle}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Calendar
                </Button>
            </MobileControlsBar>

            <div className="container mx-auto p-6 max-w-7xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Connected Calendars</CardTitle>
                    <CardDescription>Sync your external calendars to manage availability and bookings</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-4">
                            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : connections.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Link2 className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No calendars connected</h3>
                            <p className="text-muted-foreground mb-4">Connect Google Calendar to sync your availability</p>
                            <Button onClick={handleConnectGoogle} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Connect Google Calendar
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {connections.map((connection) => (
                                <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                            <img src="/google-calendar.svg" alt="Google" className="w-6 h-6" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                        </div>
                                        <div>
                                            <p className="font-medium">{connection.email}</p>
                                            <p className="text-sm text-muted-foreground capitalize">{connection.provider}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge variant={connection.is_active ? 'default' : 'secondary'}>
                                            {connection.is_active ? (
                                                <><CheckCircle className="h-3 w-3 mr-1" />Active</>
                                            ) : (
                                                <><XCircle className="h-3 w-3 mr-1" />Inactive</>
                                            )}
                                        </Badge>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSync(connection.id)}
                                            disabled={syncing === connection.id}
                                        >
                                            <RefreshCw className={`h-4 w-4 mr-2 ${syncing === connection.id ? 'animate-spin' : ''}`} />
                                            Sync
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleDisconnect(connection.id)} className="text-destructive">
                                                    <Trash2 className="h-4 w-4 mr-2" />Disconnect
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
                </Card>
            </div>
        </>
    );
}

export default CalendarIntegrationsPage;
