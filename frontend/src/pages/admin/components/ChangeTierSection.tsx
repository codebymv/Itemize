import React, { useState } from 'react';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { type Plan, PLAN_METADATA } from '@/lib/subscription';
import { Loader2, User as UserIcon, Zap, Crown, Building2 } from 'lucide-react';
import * as adminApi from '@/services/adminApi';

const PLAN_ICONS = {
    free: UserIcon,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

function ChangeTierSection() {
    const { subscription } = useSubscriptionState();
    const { refreshSubscription } = useSubscriptionFeatures();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const { toast } = useToast();

    const currentPlan = (subscription?.planName?.toLowerCase() as Plan) || 'free';

    const plans: { id: Plan; label: string; icon: typeof UserIcon }[] = [
        { id: 'free', label: PLAN_METADATA.free.displayName, icon: PLAN_ICONS.free },
        { id: 'starter', label: PLAN_METADATA.starter.displayName, icon: PLAN_ICONS.starter },
        { id: 'unlimited', label: PLAN_METADATA.unlimited.displayName, icon: PLAN_ICONS.unlimited },
        { id: 'pro', label: PLAN_METADATA.pro.displayName, icon: PLAN_ICONS.pro }
    ];

    const handleChangePlan = async (planId: Plan) => {
        if (loadingPlan) return;
        
        setLoadingPlan(planId);
        try {
            await adminApi.updateMyPlan(planId);
            await refreshSubscription();
            const planDisplayName = PLAN_METADATA[planId]?.displayName || planId;
            toast({
                title: 'Plan Updated',
                description: `Your plan has been changed to ${planDisplayName}`,
            });
            setLoadingPlan(null);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to update plan',
                variant: 'destructive'
            });
            setLoadingPlan(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold font-raleway">
                    Change Tier
                </h2>
                <p className="text-sm text-muted-foreground">
                    Testing and development tools
                </p>
            </div>

            <Separator />

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
                                    className={`h-auto py-4 flex items-center justify-center gap-2 ${isSelected ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                    onClick={() => handleChangePlan(plan.id)}
                                    disabled={loadingPlan !== null}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <PlanIcon className="h-4 w-4" />
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