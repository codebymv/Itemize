import React, { useState } from 'react';
import { Link2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContactCatalogPicker } from '@/components/ContactCatalogPicker';
import { UpgradeCTA } from '@/components/subscription/UpgradeCTA';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/hooks/useOrganization';
import { contactDisplayName } from '@/lib/contactDisplayName';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

export interface WorkspaceContactLinkProps {
  contactId?: number | null;
  contactName?: string | null;
  /**
   * Called with the next binding. The name accompanies the id so the card can
   * render optimistically before the server's derived contactName arrives.
   */
  onChange: (contactId: number | null, contactName: string | null) => Promise<unknown> | unknown;
  className?: string;
}

/**
 * The client chip shown under a workspace card's category row. Binding is a
 * paid capability: without it an existing link stays visible (workspace data
 * never looks deleted) but cannot be changed, and an empty slot offers the
 * upgrade instead of a picker.
 */
export const WorkspaceContactLink: React.FC<WorkspaceContactLinkProps> = ({
  contactId,
  contactName,
  onChange,
  className,
}) => {
  const { hasFeature } = useSubscription();
  const { organizationId } = useOrganization();
  const canBind = hasFeature('contacts') && organizationId !== null;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);

  const isLinked = typeof contactId === 'number' && contactId > 0;
  const label = contactName?.trim() || (isLinked ? `Client #${contactId}` : null);

  const closeDialog = () => {
    setOpen(false);
    setSelected(null);
  };

  const commit = async (nextId: number | null, nextName: string | null) => {
    setSaving(true);
    try {
      await onChange(nextId, nextName);
      closeDialog();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn('mb-2 px-6 flex items-center gap-1', className)}
      data-testid="workspace-contact-link"
    >
      {isLinked ? (
        <>
          {canBind ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
              aria-label={`Linked to ${label}. Change linked client`}
            >
              <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          ) : (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
              aria-label={`Linked to ${label}`}
            >
              <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </span>
          )}
          {canBind && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Unlink client"
              disabled={saving}
              onClick={() => void commit(null, null)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </>
      ) : canBind ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Link2 className="mr-1 h-3 w-3" aria-hidden="true" />
          Link to client
        </Button>
      ) : (
        <UpgradeCTA
          requiredPlan="starter"
          feature="CONTACTS"
          variant="subtle"
          size="sm"
          className="h-6 rounded-full px-2 text-xs shadow-none"
          description="Link this to a client to turn it into estimates, invoices, and signature requests."
        >
          Link to a client
        </UpgradeCTA>
      )}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link to a client</DialogTitle>
            <DialogDescription>
              This card will appear on the client&apos;s page and can be turned into
              client-facing documents from there.
            </DialogDescription>
          </DialogHeader>
          <ContactCatalogPicker
            organizationId={organizationId}
            selectedContact={selected}
            onSelect={setSelected}
            status="active"
            allowNone={false}
            placeholder="Search clients"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selected || saving}
              onClick={() => selected && void commit(selected.id, contactDisplayName(selected))}
            >
              {saving ? 'Linking…' : 'Link client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkspaceContactLink;
