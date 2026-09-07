import React, { useState } from 'react';
import { Plus, UserRound, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { ContactCatalogPicker } from '@/components/ContactCatalogPicker';
import { UpgradeCTA } from '@/components/subscription/UpgradeCTA';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useOrganization } from '@/hooks/useOrganization';
import { contactDisplayName } from '@/lib/contactDisplayName';
import { accentFill, useCardAccent } from '@/lib/cardAccent';
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
 * The chip wears the card's own accent (its colour), so a green list has a
 * green client chip and a frame's header chip matches the frame. Brand blue
 * is only what a card starts with.
 */

/**
 * The client chip beside a workspace card's category badge. Binding is a paid
 * capability: without it an existing link stays visible (workspace data never
 * looks deleted) but cannot be changed, and an empty slot offers the upgrade
 * instead of a picker.
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
  const accent = useCardAccent();
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
          <Badge
            className="max-w-full gap-0 border p-0 font-raleway"
            style={accentFill(accent)}
            data-testid="workspace-contact-chip"
          >
            {canBind ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="interaction-control inline-flex min-w-0 items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1.5 touch-manipulation"
                aria-label={`Linked to ${label}`}
              >
                <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            ) : (
              <span
                className="inline-flex min-w-0 items-center gap-1 px-2.5 py-0.5"
                aria-label={`Linked to ${label}`}
              >
                <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </span>
            )}
            {canBind && (
              <button
                type="button"
                className="interaction-control relative mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full touch-manipulation after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] disabled:opacity-50"
                aria-label="Unlink client"
                title="Unlink client"
                disabled={saving}
                onClick={() => void commit(null, null)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </Badge>
          {canBind && (
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              aria-label="Change linked client"
              title="Change linked client"
              disabled={saving}
              onClick={() => setOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </>
      ) : canBind ? (
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="font-raleway text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Link to client
        </Button>
      ) : (
        <UpgradeCTA
          requiredPlan="starter"
          feature="CONTACTS"
          variant="subtle"
          size="compact"
          className="font-raleway"
          description="Link this to a client to turn it into estimates, invoices, and signature requests."
        >
          Link to a client
        </UpgradeCTA>
      )}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
        <ModalContent size="sm">
          <ModalHeader
            icon={UserRound}
            title={isLinked ? 'Change linked client' : 'Link to a client'}
            description="This card will appear on the client's page and can be turned into client-facing documents from there."
          />
          <ModalBody>
            <ContactCatalogPicker
              organizationId={organizationId}
              selectedContact={selected}
              onSelect={setSelected}
              status="active"
              allowNone={false}
              placeholder="Search clients"
            />
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selected || saving}
              aria-busy={saving || undefined}
              onClick={() => selected && void commit(selected.id, contactDisplayName(selected))}
            >
              {saving ? 'Linking…' : 'Link client'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Dialog>
    </div>
  );
};

export default WorkspaceContactLink;
