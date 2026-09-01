import React, { useState } from 'react';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { type Plan, PLAN_METADATA } from '@/lib/subscription';
import { Loader2, User as UserIcon, Zap, Crown, Building2 } from 'lucide-react';
import * as adminApi from '@/services/adminApi';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

const PLAN_ICONS = {
    free: UserIcon,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

const getErrorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error ? error.message : fallback;

function ChangeTierSection() {
    const { subscription } = useSubscriptionState();
    const { refreshSubscription } = useSubscriptionFeatures();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const { toast } = useToast();
    const { pending, run } = useSingleFlightAction();

    const currentPlan = (subscription?.planName?.toLowerCase() as Plan) || 'free';

    const plans: { id: Plan; label: string; icon: typeof UserIcon }[] = [
        { id: 'free', label: PLAN_METADATA.free.displayName, icon: PLAN_ICONS.free },
        { id: 'starter', label: PLAN_METADATA.starter.displayName, icon: PLAN_ICONS.starter },
        { id: 'unlimited', label: PLAN_METADATA.unlimited.displayName, icon: PLAN_ICONS.unlimited },
        { id: 'pro', label: PLAN_METADATA.pro.displayName, icon: PLAN_ICONS.pro }
    ];

    const handleChangePlan = async (planId: Plan) => {
        await run(async () => {
            setLoadingPlan(planId);
            try {
                await adminApi.updateMyPlan(planId);
                const refreshed = await refreshSubscription();
                const expectedStatus = planId === 'free' ? 'none' : 'active';
                if (
                    refreshed?.planName?.toLowerCase() !== planId
                    || refreshed.status !== expectedStatus
                ) {
                    throw new Error('The plan update was accepted but the entitlement state did not refresh.');
                }
                const planDisplayName = PLAN_METADATA[planId]?.displayName || planId;
                toast({
                    title: 'Plan Updated',
                    description: `Your plan has been changed to ${planDisplayName}`,
                });
            } catch (error) {
                toast({
                    title: 'Error',
                    description: getErrorMessage(error, 'Failed to update plan'),
                    variant: 'destructive'
                });
            } finally {
                setLoadingPlan(null);
            }
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                        {plans.map((plan) => {
                            const PlanIcon = plan.icon;
                            const isSelected = currentPlan === plan.id;
                            const isLoading = loadingPlan === plan.id;
                            
                            return (
                                <Button
                                    key={plan.id}
                                    variant={isSelected ? 'default' : 'outline'}
                                    className={`h-auto py-4 flex items-center justify-center gap-2 ${isSelected ? 'bg-blue-600 interaction-button--primary text-white' : ''}`}
                                    onClick={() => handleChangePlan(plan.id)}
                                    disabled={pending}
                                    aria-busy={isLoading ? 'true' : undefined}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <PlanIcon className={isSelected ? 'h-4 w-4 text-white' : 'icon-accent h-4 w-4'} />
                                    )}
                                    {plan.label}
                                </Button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default ChangeTierSection;
