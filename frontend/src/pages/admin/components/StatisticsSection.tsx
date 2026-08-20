import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Activity, BarChart3, CreditCard, Loader2, RotateCcw, Send, Users } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import * as adminApi from '@/services/adminApi';

function StatisticsSection() {
    const [stats, setStats] = useState<adminApi.SystemStats | null>(null);
    const [funnel, setFunnel] = useState<adminApi.ActivationFunnel | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [systemStats, activationFunnel] = await Promise.all([
                    adminApi.getStats(),
                    adminApi.getActivationFunnel(30),
                ]);
                setStats(systemStats);
                setFunnel(activationFunnel);
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
                    System totals and the last 30 days of signup activation
                </p>
            </div>

            <Separator />

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-6">
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
                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold font-raleway">Activation funnel</h3>
                            <p className="text-sm text-muted-foreground">
                                Organization cohorts; conversion rates after a provider-confirmed first send
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <StatCard
                                title="First send"
                                badgeText={`${funnel?.organizationsSent || 0} of ${funnel?.organizationsCreated || 0} signups`}
                                value={`${Math.round((funnel?.sendRate || 0) * 100)}%`}
                                icon={Send}
                                colorTheme="blue"
                            />
                            <StatCard
                                title="Recipient advanced"
                                badgeText={`${funnel?.organizationsAdvanced || 0} organizations`}
                                value={`${Math.round((funnel?.advanceRate || 0) * 100)}%`}
                                icon={Activity}
                                colorTheme="green"
                            />
                            <StatCard
                                title="Returned after send"
                                badgeText={`${funnel?.organizationsReturned || 0} organizations`}
                                value={`${Math.round((funnel?.returnRate || 0) * 100)}%`}
                                icon={RotateCcw}
                                colorTheme="orange"
                            />
                            <StatCard
                                title="Trial to paid"
                                badgeText={`${funnel?.organizationsTrialToPaid || 0} of ${funnel?.trialOrganizationsSent || 0} activated trials`}
                                value={`${Math.round((funnel?.trialToPaidRate || 0) * 100)}%`}
                                icon={CreditCard}
                                colorTheme="green"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StatisticsSection;
