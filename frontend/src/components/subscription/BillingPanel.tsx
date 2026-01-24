/**
 * Billing Panel Component
 * Settings page subscription management panel
 * Following gleamai pattern adapted for itemize.cloud
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Loader2, 
    ExternalLink, 
    Zap, 
    Crown, 
    Building2,
    Mail,
    MessageSquare,
    Globe,
    Users,
    Workflow,
    FileText,
    Calendar
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PricingCards from './PricingCards';
import { billingApi, BillingStatus, UsageStats } from '@/services/billingApi';
import { 
    Plan, 
    PLANS,
    PLAN_METADATA, 
    PLAN_PRICING
} from '@/lib/subscription';

// Plan icons
const PLAN_ICONS: Record<Plan, typeof Zap> = {
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

export function BillingPanel() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [processing, setProcessing] = useState(false);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statusResult, usageResult] = await Promise.all([
                billingApi.getBillingStatus(),
                billingApi.getUsageStats()
            ]);
            
            if (statusResult.success && statusResult.data) {
                setStatus(statusResult.data);
                setBillingPeriod(statusResult.data.billing_period || 'monthly');
            }
            if (usageResult.success && usageResult.data) {
                setUsage(usageResult.data);
            }
        } catch (error) {
            console.error('Failed to fetch billing data:', error);
            toast({
                title: 'Error',
                description: 'Failed to load billing information',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePortal = async () => {
        setProcessing(true);
        try {
            await billingApi.redirectToPortal();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to open billing portal',
                variant: 'destructive',
            });
            setProcessing(false);
        }
    };

    const handleUpgrade = async (planId: Plan) => {
        setProcessing(true);
        try {
            await billingApi.redirectToCheckout({
                planId,
                billingPeriod,
            });
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to start checkout',
                variant: 'destructive',
            });
            setProcessing(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-32 mb-4" />
                            <Skeleton className="h-4 w-48 mb-2" />
                            <Skeleton className="h-10 w-full" />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-full" />
                        </CardContent>
                    </Card>
                </div>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
            </div>
        );
    }

    if (!status) return null;

    const currentPlan = status.plan || 'starter';
    const meta = PLAN_METADATA[currentPlan];
    const pricing = PLAN_PRICING[currentPlan];
    const Icon = PLAN_ICONS[currentPlan];

    // Calculate renewal date
    const getRenewalDate = () => {
        if (!status.billing_period_start) return null;
        try {
            const periodStart = new Date(status.billing_period_start);
            const renewalDate = new Date(periodStart);
            renewalDate.setMonth(renewalDate.getMonth() + 1);
            return renewalDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        } catch {
            return null;
        }
    };

    const renewalDate = getRenewalDate();
    const hasActiveSubscription = status.subscription_status === 'active' || status.subscription_status === 'trialing';
    const isTrial = status.subscription_status === 'trialing';
    const isPastDue = status.subscription_status === 'past_due';

    return (
        <div className="space-y-6">
            {/* Status Banner for Past Due */}
            {isPastDue && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                    <p className="font-medium">Payment Past Due</p>
                    <p className="text-sm mt-1">
                        Your payment failed. Please update your payment method to continue using premium features.
                    </p>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                        onClick={handlePortal}
                        disabled={processing}
                    >
                        Update Payment Method
                    </Button>
                </div>
            )}

            {/* Current Plan & Usage */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Current Plan Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Current Plan
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${meta.bgColor}`}>
                                <Icon className={`h-5 w-5 ${meta.color}`} />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">{meta.displayName}</h3>
                                <p className="text-sm text-muted-foreground">
                                    ${billingPeriod === 'yearly' ? pricing.yearlyMonthly.toFixed(2) : pricing.monthly}/month
                                    {billingPeriod === 'yearly' && ' (billed annually)'}
                                </p>
                            </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2">
                            {isTrial && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                    Trial
                                </Badge>
                            )}
                            {status.cancel_at_period_end && (
                                <Badge variant="secondary" className="bg-red-100 text-red-800">
                                    Cancels at period end
                                </Badge>
                            )}
                        </div>

                        {/* Renewal Info */}
                        {renewalDate && hasActiveSubscription && (
                            <p className="text-sm text-muted-foreground">
                                {status.cancel_at_period_end 
                                    ? `Access until ${renewalDate}` 
                                    : `Renews on ${renewalDate}`
                                }
                            </p>
                        )}

                        {/* Trial End Info */}
                        {isTrial && status.trial_ends_at && (
                            <p className="text-sm text-amber-600">
                                Trial ends on {new Date(status.trial_ends_at).toLocaleDateString()}
                            </p>
                        )}

                        {/* Manage Button */}
                        {hasActiveSubscription && status.stripe_customer_id && (
                            <Button
                                variant="outline"
                                className="w-full text-blue-600 border-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-400 dark:hover:bg-blue-950"
                                onClick={handlePortal}
                                disabled={processing}
                            >
                                {processing ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                )}
                                Manage Subscription
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Usage Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Monthly Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Emails */}
                        <UsageRow
                            icon={Mail}
                            label="Emails"
                            used={usage?.usage?.emails?.used || status.emails_used || 0}
                            limit={usage?.usage?.emails?.limit === 'unlimited' ? -1 : (status.emails_limit || 1000)}
                        />

                        {/* SMS */}
                        <UsageRow
                            icon={MessageSquare}
                            label="SMS Messages"
                            used={usage?.usage?.sms?.used || status.sms_used || 0}
                            limit={usage?.usage?.sms?.limit === 'unlimited' ? -1 : (status.sms_limit || 500)}
                        />

                        {/* API Calls */}
                        {status.api_calls_limit !== 0 && (
                            <UsageRow
                                icon={Globe}
                                label="API Calls"
                                used={usage?.usage?.apiCalls?.used || status.api_calls_used || 0}
                                limit={usage?.usage?.apiCalls?.limit === 'unlimited' ? -1 : (status.api_calls_limit || 0)}
                            />
                        )}

                        {/* Billing Period */}
                        {usage?.period?.start && usage?.period?.end && (
                            <p className="text-xs text-muted-foreground pt-2 border-t">
                                Usage period: {new Date(usage.period.start).toLocaleDateString()} - {new Date(usage.period.end).toLocaleDateString()}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Resource Counts */}
            {usage?.resources && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Resource Counts
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <ResourceCount
                                icon={Users}
                                label="Contacts"
                                count={usage.resources.contacts}
                                limit={status.contacts_limit}
                            />
                            <ResourceCount
                                icon={Workflow}
                                label="Workflows"
                                count={usage.resources.workflows}
                                limit={status.workflows_limit}
                            />
                            <ResourceCount
                                icon={FileText}
                                label="Forms"
                                count={usage.resources.forms}
                                limit={status.forms_limit}
                            />
                            <ResourceCount
                                icon={Globe}
                                label="Landing Pages"
                                count={usage.resources.landingPages}
                                limit={status.landing_pages_limit}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Available Plans */}
            <div>
                <h3 className="text-lg font-semibold mb-4">
                    {hasActiveSubscription ? 'Change Plan' : 'Choose a Plan'}
                </h3>
                <PricingCards
                    currentPlan={currentPlan}
                    variant="dashboard"
                    onUpgrade={handleUpgrade}
                    isLoading={processing}
                    showYearlyToggle={true}
                    billingPeriod={billingPeriod}
                    onBillingPeriodChange={setBillingPeriod}
                />
            </div>
        </div>
    );
}

// Usage Row Component
interface UsageRowProps {
    icon: typeof Mail;
    label: string;
    used: number;
    limit: number;
}

function UsageRow({ icon: Icon, label, used, limit }: UsageRowProps) {
    const isUnlimited = limit === -1;
    const percentage = isUnlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100);
    const isApproaching = !isUnlimited && percentage >= 80;
    const isExceeded = !isUnlimited && used >= limit;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {label}
                </span>
                <span className={isExceeded ? 'text-red-600 font-medium' : isApproaching ? 'text-amber-600' : ''}>
                    {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()}
                </span>
            </div>
            {!isUnlimited && (
                <Progress 
                    value={percentage} 
                    className="h-2"
                    indicatorClassName={
                        isExceeded 
                            ? 'bg-red-500' 
                            : isApproaching 
                                ? 'bg-amber-500' 
                                : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                    }
                />
            )}
        </div>
    );
}

// Resource Count Component
interface ResourceCountProps {
    icon: typeof Users;
    label: string;
    count: number;
    limit: number;
}

function ResourceCount({ icon: Icon, label, count, limit }: ResourceCountProps) {
    const isUnlimited = limit === -1;
    const percentage = isUnlimited ? 0 : Math.round((count / limit) * 100);
    const isApproaching = !isUnlimited && percentage >= 80;

    return (
        <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <Icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <div className={`text-lg font-semibold ${isApproaching ? 'text-amber-600' : ''}`}>
                {count.toLocaleString()}
                {!isUnlimited && (
                    <span className="text-sm font-normal text-muted-foreground">
                        /{limit === -1 ? '∞' : limit.toLocaleString()}
                    </span>
                )}
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
        </div>
    );
}

export default BillingPanel;
