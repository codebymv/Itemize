import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Users, BarChart3, Loader2 } from 'lucide-react';
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

    const StatCard = ({ title, value, icon: Icon }: { title: string; value: number; icon: any }) => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{title}</p>
                        <p className="text-3xl font-bold">{value?.toLocaleString() || 0}</p>
                    </div>
                    <Icon className="h-8 w-8 text-blue-600 opacity-50" />
                </div>
            </CardContent>
        </Card>
    );

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
                    <StatCard title="Total Users" value={stats?.users || 0} icon={Users} />
                    <StatCard title="Contacts" value={stats?.contacts || 0} icon={Users} />
                    <StatCard title="Invoices" value={stats?.invoices || 0} icon={BarChart3} />
                </div>
            )}
        </div>
    );
}

export default StatisticsSection;