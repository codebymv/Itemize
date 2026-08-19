import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  CreditCard,
  ListChecks,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useStatStyles } from '@/hooks/useStatStyles';
import { cn } from '@/lib/utils';
import {
  dismissGetStartedViaGraphql,
  getStartedProgressViaGraphql,
  type GetStartedStep,
} from '@/services/getStartedGraphql';
import { useOrganization } from '@/hooks/useOrganization';

const STEP_COPY: Record<string, { label: string; description: string }> = {
  workspace_ready: {
    label: 'Your workspace is ready',
    description: 'Add company details anytime in Settings',
  },
  first_contact: {
    label: 'Add your first contact',
    description: 'Start the CRM with one person or company',
  },
  first_list: {
    label: 'Create a list',
    description: 'Put a checklist on the canvas',
  },
  first_money: {
    label: 'Create an invoice or a deal',
    description: 'Bill a customer or track an opportunity',
  },
};

const STEP_ICON = {
  workspace_ready: Settings,
  first_contact: Users,
  first_list: ListChecks,
  first_money: CreditCard,
} as const;

export function GetStartedCard() {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const queryKey = ['get-started-progress', organizationId];
  const { iconBgClass, iconClass } = useStatStyles('blue');

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: getStartedProgressViaGraphql,
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const dismiss = useMutation({
    mutationFn: dismissGetStartedViaGraphql,
    onSuccess: (progress) => {
      queryClient.setQueryData(queryKey, progress);
    },
  });

  if (isLoading || !data || data.dismissed) return null;
  if (data.completedCount === data.totalCount) return null;

  const percent = data.totalCount > 0
    ? (data.completedCount / data.totalCount) * 100
    : 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">
              Get started with Itemize
            </CardTitle>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={percent} className="h-2 w-40 sm:w-56" />
              <span className="text-xs text-muted-foreground">
                {data.completedCount}/{data.totalCount} complete
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismiss.mutate()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss Get Started"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.steps.map((step) => (
          <GetStartedRow
            key={step.id}
            step={step}
            iconBgClass={iconBgClass}
            iconClass={iconClass}
            onOpen={() => navigate(step.href)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function GetStartedRow({
  step,
  iconBgClass,
  iconClass,
  onOpen,
}: {
  step: GetStartedStep;
  iconBgClass: string;
  iconClass: string;
  onOpen: () => void;
}) {
  const copy = STEP_COPY[step.id] ?? {
    label: step.id,
    description: '',
  };
  const Icon = STEP_ICON[step.id as keyof typeof STEP_ICON] ?? Circle;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50',
        step.completed && 'opacity-70',
      )}
    >
      {step.completed ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            step.completed && 'line-through text-muted-foreground',
          )}
        >
          {copy.label}
        </p>
        <p className="truncate text-xs text-muted-foreground">{copy.description}</p>
      </div>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          iconBgClass,
          iconClass,
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>
    </button>
  );
}
