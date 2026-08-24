import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  FileText,
  LayoutGrid,
  Send,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useStatStyles } from '@/hooks/useStatStyles';
import { cn } from '@/lib/utils';
import {
  dismissGetStartedViaGraphql,
  getStartedProgressQueryKey,
  getStartedProgressViaGraphql,
  type GetStartedStep,
} from '@/services/getStartedGraphql';
import { useOrganization } from '@/hooks/useOrganization';

const STEP_COPY: Record<string, { label: string; description: string }> = {
  first_contact: {
    label: 'Add a client',
    description: 'Give your first estimate a real recipient',
  },
  first_list: {
    label: 'Add something to your workspace',
    description: 'Choose a list, note, whiteboard, wireframe, or vault',
  },
  first_workspace_item: {
    label: 'Add something to your workspace',
    description: 'Choose a list, note, whiteboard, wireframe, or vault',
  },
  first_artifact: {
    label: 'Create an estimate',
    description: 'Turn the work into a clear price for your client',
  },
  first_send: {
    label: 'Send it to your client',
    description: 'Share it and start tracking the response',
  },
};

const STEP_ICON = {
  first_contact: Users,
  first_list: LayoutGrid,
  first_workspace_item: LayoutGrid,
  first_artifact: FileText,
  first_send: Send,
} as const;

const STEP_ACTION: Record<string, string> = {
  first_contact: 'Add client',
  first_list: 'Open canvas',
  first_workspace_item: 'Open canvas',
  first_artifact: 'Create estimate',
  first_send: 'Open drafts',
};

export function GetStartedCard() {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const queryKey = getStartedProgressQueryKey(organizationId);
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
  const nextStep = data.steps.find((step) => !step.completed);
  const isBusinessJourney = data.steps.some((step) => step.id === 'first_contact');

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">
              {isBusinessJourney ? 'Get your first client approval' : 'Start your workspace'}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isBusinessJourney
                ? 'Follow one simple path from client to sent estimate.'
                : 'Begin with one useful piece of work.'}
            </p>
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
            isCurrent={step.id === nextStep?.id}
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
  isCurrent,
  iconBgClass,
  iconClass,
  onOpen,
}: {
  step: GetStartedStep;
  isCurrent: boolean;
  iconBgClass: string;
  iconClass: string;
  onOpen: () => void;
}) {
  const copy = STEP_COPY[step.id] ?? {
    label: step.id,
    description: '',
  };
  const Icon = STEP_ICON[step.id as keyof typeof STEP_ICON] ?? Circle;

  const content = (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left',
        isCurrent && 'border border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/30',
        !step.completed && !isCurrent && 'opacity-55',
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
      {isCurrent ? (
        <Button type="button" size="sm" onClick={onOpen} className="shrink-0">
          {STEP_ACTION[step.id] ?? 'Continue'}
        </Button>
      ) : (
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
      )}
    </div>
  );

  return content;
}
