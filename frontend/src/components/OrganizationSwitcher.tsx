import { useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganizationContext } from '@/contexts/organization-context';
import { useToast } from '@/hooks/use-toast';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

export const OrganizationSwitcher = () => {
  const {
    organizations,
    organization,
    isLoading,
    isSwitching,
    selectOrganization,
  } = useOrganizationContext();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { pending, run, dismissIfIdle } = useSingleFlightAction();

  if (isLoading || !organization || organizations.length < 2) return null;

  const handleSelect = async (organizationId: number) => {
    await run(async () => {
      setOpen(false);
      try {
        await selectOrganization(organizationId);
      } catch {
        toast({
          title: 'Organization switch failed',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={nextOpen => {
      if (nextOpen) setOpen(true);
      else dismissIfIdle(() => setOpen(false));
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 min-w-11 max-w-48 gap-2"
          disabled={isSwitching || pending}
          aria-busy={isSwitching || pending ? 'true' : undefined}
          aria-label={`Current organization: ${organization.name}`}
        >
          <Building2 className="h-4 w-4 flex-shrink-0" />
          <span className="truncate hidden sm:inline">{organization.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {organizations.map((candidate) => (
          <DropdownMenuItem
            key={candidate.id}
            disabled={isSwitching || pending}
            onSelect={() => void handleSelect(candidate.id)}
          >
            <span className="flex-1 truncate">{candidate.name}</span>
            {candidate.id === organization.id && <Check className="ml-2 h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
