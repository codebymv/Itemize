import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Users, BarChart3, Loader2 } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import * as adminApi from '@/services/adminApi';

function StatisticsSection() {
    const [stats, setStats] = useState<adminApi.SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await adminApi.getStats();
                setStats(response);
            } catch (error) {
                toast({
                    title: 'Error',
                    description: 'Failed to load statistics',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [toast]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold font-raleway">
                    System Statistics
                </h2>
                <p className="text-sm text-muted-foreground">
                    Overview of system metrics
                </p>
            </div>

            <Separator />

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard
                        title="Total Users"
                        badgeText="Total Users"
                        value={(stats?.users || 0).toLocaleString()}
                        icon={Users}
                        colorTheme="blue"
                    />
                    <StatCard
                        title="Contacts"
                        badgeText="Contacts"
                        value={(stats?.contacts || 0).toLocaleString()}
                        icon={Users}
                        colorTheme="blue"
                    />
                    <StatCard
                        title="Invoices"
                        badgeText="Invoices"
                        value={(stats?.invoices || 0).toLocaleString()}
                        icon={BarChart3}
                        colorTheme="blue"
                    />
                </div>
            )}
        </div>
    );
}

export default StatisticsSection;
