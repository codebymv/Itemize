import React, { useEffect, useState } from 'react';
import {
    Activity,
    BadgeCheck,
    BarChart3,
    Contact,
    CreditCard,
    FilePlus2,
    Loader2,
    MousePointerClick,
    PanelsTopLeft,
    Rocket,
    RotateCcw,
    Send,
    ShoppingCart,
    Users,
} from 'lucide-react';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { StatCard } from '@/components/StatCard';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import * as adminApi from '@/services/adminApi';
import { formatMedian } from './activationFunnelFormat';

type CohortDays = 7 | 30 | 90;

const percent = (value = 0) => `${Math.round(value * 100)}%`;

function StatisticsSection() {
    const [stats, setStats] = useState<adminApi.SystemStats | null>(null);
    const [funnel, setFunnel] = useState<adminApi.ActivationFunnel | null>(null);
    const [cohortDays, setCohortDays] = useState<CohortDays>(30);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        let active = true;

        const fetchStats = async () => {
            setLoading(true);
            try {
                const [systemStats, activationFunnel] = await Promise.all([
                    adminApi.getStats(),
                    adminApi.getActivationFunnel(cohortDays),
                ]);
                if (!active) return;
                setStats(systemStats);
                setFunnel(activationFunnel);
            } catch {
                if (!active) return;
                toast({
                    title: 'Error',
                    description: 'Failed to load statistics',
                    variant: 'destructive',
                });
            } finally {
                if (active) setLoading(false);
            }
        };

        void fetchStats();
        return () => { active = false; };
    }, [cohortDays, toast]);

    if (loading) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const created = funnel?.organizationsCreated || 0;
    const verified = funnel?.organizationsVerified || 0;

    return (
        <div className="space-y-6">
            <ResponsiveCardRail
                label="System totals"
                desktopColumns="md:grid-cols-3"
                className="mb-0"
            >
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
                    icon={Contact}
                    colorTheme="blue"
                />
                <StatCard
                    title="Invoices"
                    badgeText="Invoices"
                    value={(stats?.invoices || 0).toLocaleString()}
                    icon={BarChart3}
                    colorTheme="blue"
                />
            </ResponsiveCardRail>

            <section aria-labelledby="activation-funnel-heading" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="activation-funnel-heading" className="text-lg font-semibold font-raleway">
                            Activation funnel
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {created.toLocaleString()} organizations joined this cohort
                        </p>
                    </div>
                    <Select
                        value={String(cohortDays)}
                        onValueChange={(value) => setCohortDays(Number(value) as CohortDays)}
                    >
                        <SelectTrigger className="h-9 w-[132px] bg-muted/20 border-border/50" aria-label="Cohort period">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">Last 7 days</SelectItem>
                            <SelectItem value="30">Last 30 days</SelectItem>
                            <SelectItem value="90">Last 90 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">Setup and first value</h3>
                    <ResponsiveCardRail
                        label="Setup and first value funnel"
                        desktopColumns="md:grid-cols-2 xl:grid-cols-3"
                        className="mb-0"
                        showIndicators
                    >
                        <StatCard
                            title="Verified"
                            badgeText="Verified"
                            value={percent(funnel?.verificationRate)}
                            description={`${verified} of ${created} signups`}
                            icon={BadgeCheck}
                            colorTheme="green"
                        />
                        <StatCard
                            title="Workspace activated"
                            badgeText="Workspace activated"
                            value={percent(funnel?.workspaceActivationRate)}
                            description={`${funnel?.organizationsWorkspaceActivated || 0} orgs · ${formatMedian(funnel?.medianHoursToWorkspace)}`}
                            icon={PanelsTopLeft}
                            colorTheme="blue"
                        />
                        <StatCard
                            title="Trial started"
                            badgeText="Trial started"
                            value={percent(funnel?.trialStartRate)}
                            description={`${funnel?.organizationsTrialStarted || 0} orgs · ${formatMedian(funnel?.medianHoursToTrial)}`}
                            icon={Rocket}
                            colorTheme="orange"
                        />
                        <StatCard
                            title="First contact"
                            badgeText="First contact"
                            value={percent(funnel?.contactCreationRate)}
                            description={`${funnel?.organizationsContactCreated || 0} orgs · ${formatMedian(funnel?.medianHoursToContact)}`}
                            icon={Contact}
                            colorTheme="blue"
                        />
                        <StatCard
                            title="Artifact created"
                            badgeText="Artifact created"
                            value={percent(funnel?.artifactCreationRate)}
                            description={`${funnel?.organizationsArtifactCreated || 0} orgs · ${formatMedian(funnel?.medianHoursToArtifact)}`}
                            icon={FilePlus2}
                            colorTheme="blue"
                        />
                        <StatCard
                            title="First send"
                            badgeText="First send"
                            value={percent(funnel?.artifactToSendRate)}
                            description={`${funnel?.organizationsSent || 0} orgs · ${formatMedian(funnel?.medianHoursToSend)}`}
                            icon={Send}
                            colorTheme="blue"
                        />
                    </ResponsiveCardRail>
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">Conversion and retention</h3>
                    <ResponsiveCardRail
                        label="Conversion and retention funnel"
                        desktopColumns="md:grid-cols-2 xl:grid-cols-3"
                        className="mb-0"
                        showIndicators
                    >
                        <StatCard
                            title="Recipient advanced"
                            badgeText="Recipient advanced"
                            value={percent(funnel?.advanceRate)}
                            description={`${funnel?.organizationsAdvanced || 0} orgs · ${formatMedian(funnel?.medianHoursToAdvance)}`}
                            icon={MousePointerClick}
                            colorTheme="green"
                        />
                        <StatCard
                            title="Returned after send"
                            badgeText="Returned after send"
                            value={percent(funnel?.returnRate)}
                            description={`${funnel?.organizationsReturned || 0} organizations`}
                            icon={RotateCcw}
                            colorTheme="orange"
                        />
                        <StatCard
                            title="Checkout started"
                            badgeText="Checkout started"
                            value={percent(funnel?.checkoutStartRate)}
                            description={`${funnel?.organizationsCheckoutStarted || 0} orgs · ${formatMedian(funnel?.medianHoursToCheckout)}`}
                            icon={ShoppingCart}
                            colorTheme="orange"
                        />
                        <StatCard
                            title="Subscription activated"
                            badgeText="Subscription activated"
                            value={percent(funnel?.subscriptionActivationRate)}
                            description={`${funnel?.organizationsSubscriptionActivated || 0} orgs · ${formatMedian(funnel?.medianHoursToSubscription)}`}
                            icon={CreditCard}
                            colorTheme="green"
                        />
                        <StatCard
                            title="Activated trial to paid"
                            badgeText="Activated trial to paid"
                            value={percent(funnel?.trialToPaidRate)}
                            description={`${funnel?.organizationsTrialToPaid || 0} of ${funnel?.trialOrganizationsSent || 0} sent trials`}
                            icon={Activity}
                            colorTheme="green"
                        />
                    </ResponsiveCardRail>
                </div>
            </section>
        </div>
    );
}

export default StatisticsSection;
