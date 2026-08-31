import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Edit,
  Trash2,
  MoreHorizontal,
  MessageSquare,
  CheckSquare,
  FileText,
  Receipt,
  FileSignature,
  Palette,
  GitBranch,
  ContactRound,
  Footprints,
  Network,
  ListChecks,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { PageLayout } from '@/components/layout/PageLayout';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { cn } from '@/lib/utils';
import {
  HeaderAction,
  HeaderActionLabel,
} from '@/components/layout/DesktopHeaderTools';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Contact } from '@/types';
import {
  deleteContact,
  addContactActivity,
  getContactDetailBootstrap,
} from '@/services/contactsApi';
import type { ContactDetailBootstrap } from '@/services/contactsGraphql';
import { ActivityTimeline } from './components/ActivityTimeline';
import { EditContactModal } from './components/EditContactModal';
import { ComposeEmailModal } from './components/ComposeEmailModal';
import { useOrganization } from '@/hooks/useOrganization';
import { getContactStatusVisual } from './constants/contactStatusConstants';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';

type RelatedContactItem = {
  id: number;
  title: string;
  category: string;
  created_at: string;
};

function RelatedContentGroup({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: RelatedContactItem[];
}) {
  return (
    <section aria-labelledby={`related-${title.toLowerCase()}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3
          id={`related-${title.toLowerCase()}`}
          className="flex items-center gap-2 text-sm font-medium"
        >
          {icon}
          {title}
        </h3>
        <Badge variant="secondary" className="shrink-0">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <EmptyState kind="inline" title={`No linked ${title.toLowerCase()}`} className="py-4" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3"
            >
              <span className="min-w-0 truncate text-sm">{item.title}</span>
              {item.category && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {item.category}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    organizationId,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newNote, setNewNote] = useState('');

  const [addingNote, setAddingNote] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const parsedContactId = id ? Number(id) : Number.NaN;
  const contactId = Number.isSafeInteger(parsedContactId) && parsedContactId > 0
    ? parsedContactId
    : null;
  const contactDetailQueryKey = [
    'contact-detail',
    organizationId,
    contactId,
  ] as const;
  const contactDetailQuery = useQuery({
    queryKey: contactDetailQueryKey,
    queryFn: ({ signal }) => getContactDetailBootstrap(
      contactId as number,
      organizationId as number,
      signal,
    ),
    enabled: Boolean(organizationId && contactId),
    refetchOnWindowFocus: false,
  });
  const contact = contactDetailQuery.data?.contact ?? null;
  const activities = contactDetailQuery.data?.activities ?? [];
  const relatedContent = contactDetailQuery.data?.relatedContent ?? {
    lists: [],
    notes: [],
    whiteboards: [],
    wireframes: [],
  };
  const hasInvalidContactId = contactId === null;
  const loading = organizationLoading
    || (!hasInvalidContactId && Boolean(organizationId) && contactDetailQuery.isPending);
  const loadError = hasInvalidContactId || contactDetailQuery.isError
    ? toastMessages.failedToLoad('contact')
    : null;

  // Helper function for contact name (used in header)
  const getContactDisplayName = (c: Contact | null) => {
    if (!c) return 'Contact';
    if (c.first_name || c.last_name) {
      return `${c.first_name || ''} ${c.last_name || ''}`.trim();
    }
    return c.email || c.company || 'Contact';
  };

  const handleCreateEstimate = () => {
    if (!contact) return;
    const params = new URLSearchParams({
      contactId: String(contact.id),
    });
    navigate(`/estimates/new?${params.toString()}`);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!contact || !organizationId) return;

    try {
      await deleteContact(contact.id, organizationId);
      toast({
        title: 'Deleted',
        description: toastMessages.deleted('contact'),
      });
      queryClient.removeQueries({ queryKey: contactDetailQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['contacts', organizationId] });
      navigate('/contacts');
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToDelete('contact'),
        variant: 'destructive',
      });
    }
  };

  // Handle add note
  const handleAddNote = async () => {
    if (!contact || !organizationId || !newNote.trim()) return;

    setAddingNote(true);
    try {
      const addedActivity = await addContactActivity(
        contact.id,
        {
          type: 'note',
          title: 'Note added',
          content: { text: newNote.trim() },
        },
        organizationId
      );

      setNewNote('');
      queryClient.setQueryData<ContactDetailBootstrap>(contactDetailQueryKey, (current) => (
        current
          ? {
              ...current,
              activities: [addedActivity, ...current.activities].slice(0, 50),
            }
          : current
      ));

      toast({
        title: 'Note Added',
        description: toastMessages.added('note'),
      });
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToAdd('note'),
        variant: 'destructive',
      });
    } finally {
      setAddingNote(false);
    }
  };

  // Handle email sent
  const handleEmailSent = () => {
    void queryClient.invalidateQueries({ queryKey: contactDetailQueryKey });
  };

  // Contact updated callback
  const handleContactUpdated = (updatedContact: Contact) => {
    queryClient.setQueryData<ContactDetailBootstrap>(contactDetailQueryKey, (current) => (
      current ? { ...current, contact: updatedContact } : current
    ));
    void queryClient.invalidateQueries({ queryKey: ['contacts', organizationId] });
    setShowEditModal(false);
    toast({
      title: 'Updated',
      description: toastMessages.updated('contact'),
    });
  };

  // Helper functions
  const getContactName = () => {
    if (!contact) return '';
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    }
    return contact.email || contact.company || 'Unnamed Contact';
  };

  const getInitials = () => {
    const name = getContactName();
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getAddressString = () => {
    if (!contact?.address) return null;
    const { street, city, state, zip, country } = contact.address;
    const parts = [street, city, state, zip, country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const backButton = (
    <ShellBackButton label="Back to contacts" onClick={() => navigate('/contacts')} />
  );

  const contactActions = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 min-w-11 gap-2 px-3 font-light"
              aria-label="Contact actions"
            >
              <MoreHorizontal className="h-4 w-4" />
              <HeaderActionLabel>More</HeaderActionLabel>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Contact actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setShowEditModal(true)} className="group/menu">
          <Edit className="mr-2 h-4 w-4" />
          Edit Contact
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Contact
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (organizationError) {
    return (
      <PageLayout title="CONTACT" icon={<Users className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />} leading={backButton}>
        <OrganizationErrorState title="Unable to load contact" icon={Users} />
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout
        title="CONTACT"
        icon={<Users className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
        leading={backButton}
      >
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </PageLayout>
    );
  }

  if (loadError || !contact) {
    return (
      <PageLayout title="CONTACT" icon={<Users className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />} leading={backButton}>
        <ErrorState
          kind="page"
          title="Contact unavailable"
          description={loadError || 'This contact is no longer available.'}
          onAction={() => void contactDetailQuery.refetch()}
        />
      </PageLayout>
    );
  }

  const contactStatusVisual = getContactStatusVisual(contact.status);
  const ContactStatusIcon = contactStatusVisual.icon;

  return (
    <PageLayout
      title="CONTACT"
      icon={<Users className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={backButton}
      headerTools={{
        status: (
          <Badge className={cn('pointer-events-none gap-1 whitespace-nowrap', contactStatusVisual.badgeClass)}>
            <ContactStatusIcon className="h-3 w-3" aria-hidden="true" />
            {contactStatusVisual.label}
          </Badge>
        ),
        secondaryAction: contactActions,
        primaryAction: (
          <HeaderAction
            label="Create estimate"
            onClick={handleCreateEstimate}
            icon={<FileText className="h-4 w-4" />}
          />
        ),
      }}
    >
      <EntityDetailHeader
        icon={<span className={cn('text-xl font-medium', contactStatusVisual.iconClass)}>{getInitials()}</span>}
        iconClassName={contactStatusVisual.iconBackgroundClass}
        title={getContactName()}
        mobileStatus={(
          <Badge className={cn('gap-1', contactStatusVisual.badgeClass)}>
            <ContactStatusIcon className="h-3 w-3" aria-hidden="true" />
            {contactStatusVisual.label}
          </Badge>
        )}
        descriptor={contact.job_title && contact.company ? `${contact.job_title} at ${contact.company}` : undefined}
        metadata={contact.tags.length > 0 ? (
          <>
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </>
        ) : undefined}
      />

      {/* Main content */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column - Details & Activity */}
        <div className="md:col-span-2 space-y-6">
          {/* Contact info card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ContactRound className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent surface="inset" className="space-y-4">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="touch-target-mobile inline-flex touch-manipulation items-center text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <a
                    href={`tel:${contact.phone}`}
                    className="touch-target-mobile inline-flex touch-manipulation items-center text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {contact.phone}
                  </a>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.company}</span>
                </div>
              )}
              {getAddressString() && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{getAddressString()}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Added {formatDate(contact.created_at)}
                </span>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right column - Quick info */}
        <div className="space-y-6">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Footprints className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent surface="inset" className="grid gap-2 lg:grid-cols-2">
              <Button
                size="sm"
                className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                onClick={handleCreateEstimate}
                aria-label="Create estimate"
              >
                <FileText className="h-4 w-4" />
                <span>Create estimate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                aria-label="Create invoice"
                onClick={() => {
                  const params = new URLSearchParams({
                    contactId: String(contact.id),
                    contactName: getContactDisplayName(contact),
                    ...(contact.email && { contactEmail: contact.email }),
                  });
                  navigate(`/invoices/new?${params.toString()}`);
                }}
              >
                <Receipt className="h-4 w-4" />
                <span>New invoice</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                aria-label="Send document"
                onClick={() => {
                  const params = new URLSearchParams({
                    contactId: String(contact.id),
                    contactName: getContactDisplayName(contact),
                    ...(contact.email && { contactEmail: contact.email }),
                  });
                  navigate(`/documents/new?${params.toString()}`);
                }}
              >
                <FileSignature className="h-4 w-4" />
                <span>Send doc</span>
              </Button>
              {contact.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                  onClick={() => setShowEmailModal(true)}
                  aria-label="Send email"
                >
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </Button>
              )}
              {contact.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                  asChild
                >
                  <a href={`tel:${contact.phone}`} aria-label="Call contact">
                    <Phone className="h-4 w-4" />
                    <span>Call</span>
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="min-w-0 justify-start overflow-hidden px-2 text-xs"
                disabled
                aria-label="Create task"
              >
                <CheckSquare className="h-4 w-4" />
                <span>New task</span>
              </Button>
            </CardContent>
          </Card>

          {/* Custom fields */}
          {Object.keys(contact.custom_fields || {}).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custom Fields</CardTitle>
              </CardHeader>
              <CardContent surface="inset" className="space-y-3">
                {Object.entries(contact.custom_fields).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-sm text-muted-foreground">{key}</p>
                    <p className="text-sm font-medium">{String(value)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Assigned to */}
          {contact.assigned_to_name && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assigned To</CardTitle>
              </CardHeader>
              <CardContent surface="inset">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium">
                    {contact.assigned_to_name[0].toUpperCase()}
                  </div>
                  <span>{contact.assigned_to_name}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="flex min-h-0 flex-col lg:h-[22.5rem]">
            <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Activity
              </CardTitle>
              <Badge variant="secondary">{activities.length}</Badge>
            </div>
          </CardHeader>
          <CardContent surface="inset" className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
              >
                {addingNote ? 'Adding...' : 'Add note'}
              </Button>
            </div>
            <Separator className="my-4" />
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
              role="region"
              aria-label="Contact activity"
              tabIndex={0}
            >
              <ActivityTimeline activities={activities} />
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col lg:h-[22.5rem]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                Related Content
              </CardTitle>
              <Badge variant="secondary">
                {relatedContent.lists.length
                  + relatedContent.notes.length
                  + relatedContent.whiteboards.length
                  + relatedContent.wireframes.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent surface="inset" className="min-h-0 flex-1">
            <div
              className="h-full overflow-y-auto overscroll-contain pr-2"
              role="region"
              aria-label="Related contact content"
              tabIndex={0}
            >
              <div className="space-y-3">
                <RelatedContentGroup
                  title="Lists"
                  icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
                  items={relatedContent.lists}
                />
                <Separator />
                <RelatedContentGroup
                  title="Notes"
                  icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                  items={relatedContent.notes}
                />
                <Separator />
                <RelatedContentGroup
                  title="Whiteboards"
                  icon={<Palette className="h-4 w-4 text-muted-foreground" />}
                  items={relatedContent.whiteboards}
                />
                <Separator />
                <RelatedContentGroup
                  title="Wireframes"
                  icon={<GitBranch className="h-4 w-4 text-muted-foreground" />}
                  items={relatedContent.wireframes}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email modal */}
      {showEmailModal && contact && organizationId && (
        <ComposeEmailModal
          contact={contact}
          organizationId={organizationId}
          onClose={() => setShowEmailModal(false)}
          onSent={handleEmailSent}
        />
      )}

      {/* Edit modal */}
      {showEditModal && organizationId && (
        <EditContactModal
          contact={contact}
          organizationId={organizationId}
          onClose={() => setShowEditModal(false)}
          onUpdated={handleContactUpdated}
        />
      )}

      {/* Delete confirmation dialog */}
      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        itemType="contact"
        itemTitle={getContactName()}
        showToast={false}
      />
    </PageLayout>
  );
}

export default ContactDetailPage;
