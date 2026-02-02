import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Zap, Crown, Building2, User } from 'lucide-react';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Plan, PLAN_METADATA, PLAN_PRICING } from '@/lib/subscription';
import { useToast } from '@/hooks/use-toast';

const PLAN_ICONS = {
    free: User,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

export function SubscriptionStatus() {
    const { subscription, planName, isLoading } = useSubscriptionState();
    const { openBillingPortal } = useSubscriptionFeatures();
    const { toast } = useToast();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Default to free if no plan or no subscription
    const currentPlan = (planName?.toLowerCase() as Plan) || 'free';
    const planMetadata = PLAN_METADATA[currentPlan] || PLAN_METADATA.free;
    const planPricing = PLAN_PRICING[currentPlan] || PLAN_PRICING.free;
    const PlanIcon = PLAN_ICONS[currentPlan] || User;

    // Calculate renewal date
    const getRenewalDate = () => {
        if (!subscription || subscription.status === 'canceled' || subscription.status === 'unpaid') {
            return null;
        }
        
        if (subscription.currentPeriod?.end) {
            try {
                const renewalDate = new Date(subscription.currentPeriod.end);
                return renewalDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
            } catch {
                return null;
            }
        }
        return null;
    };

    const renewalDate = getRenewalDate();
    const isPaidPlan = currentPlan !== 'free' && subscription?.status === 'active';

    const handleManageSubscription = async () => {
        try {
            await openBillingPortal();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to open billing portal',
                variant: 'destructive',
            });
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    Current Plan
                </CardTitle>
                <div className="flex items-start justify-between gap-4 mt-2">
                    <div className="flex items-center gap-2">
                        <PlanIcon className="h-5 w-5 text-blue-600" />
                        <span className="text-2xl font-semibold">{planMetadata.displayName}</span>
                        {planMetadata.popular && (
                            <Badge variant="secondary" className="ml-2">
                                Most Popular
                            </Badge>
                        )}
                    </div>
                    <div className="text-lg font-semibold text-foreground whitespace-nowrap">
                        {currentPlan === 'free' ? '$0' : `$${planPricing.monthly}/month`}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1">
                    {renewalDate && (
                        <div className="text-xs text-muted-foreground">
                            Renews on {renewalDate}
                        </div>
                    )}
                    {subscription?.status === 'trialing' && (
                        <Badge variant="outline" className="mt-2">
                            Trial Active
                        </Badge>
                    )}
                    {subscription?.status === 'past_due' && (
                        <Badge variant="destructive" className="mt-2">
                            Payment Required
                        </Badge>
                    )}
                </div>

                {isPaidPlan && subscription?.status !== 'canceled' && (
                    <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={handleManageSubscription}
                    >
                        Manage Subscription
                        <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
