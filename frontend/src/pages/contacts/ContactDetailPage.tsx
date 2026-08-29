import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  AlertTriangle,
  AlertCircle,
  Archive,
  CheckCircle,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  HeaderAction,
  HeaderActionLabel,
} from '@/components/layout/DesktopHeaderTools';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Contact, ContactActivity } from '@/types';
import {
  getContact,
  deleteContact,
  getContactActivities,
  addContactActivity,
  getContactContent,
} from '@/services/contactsApi';
import { ActivityTimeline } from './components/ActivityTimeline';
import { EditContactModal } from './components/EditContactModal';
import { ComposeEmailModal } from './components/ComposeEmailModal';
import { useOrganization } from '@/hooks/useOrganization';
import { getContactStatusBadgeClass } from '@/lib/badge-utils';

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
        <p className="text-sm text-muted-foreground">No linked {title.toLowerCase()}</p>
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

  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<ContactActivity[]>([]);
  const [relatedContent, setRelatedContent] = useState<{
    lists: RelatedContactItem[];
    notes: RelatedContactItem[];
    whiteboards: RelatedContactItem[];
    wireframes: RelatedContactItem[];
  }>({ lists: [], notes: [], whiteboards: [], wireframes: [] });
  const [loading, setLoading] = useState(true);
  const { organizationId } = useOrganization();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newNote, setNewNote] = useState('');

  const [addingNote, setAddingNote] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

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

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
    }
  }, [organizationId]);

  // Fetch contact data
  const fetchContact = useCallback(async () => {
    if (!id || !organizationId) return;

    setLoading(true);
    try {
      const [contactData, activitiesData, contentData] = await Promise.all([
        getContact(parseInt(id), organizationId),
        getContactActivities(parseInt(id), { limit: 50 }, organizationId),
        getContactContent(parseInt(id), organizationId),
      ]);

      setContact(contactData);
      setActivities(activitiesData);
      setRelatedContent(contentData);
    } catch (error) {
      console.error('Error fetching contact:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToLoad('contact'),
        variant: 'destructive',
      });
      navigate('/contacts');
    } finally {
      setLoading(false);
    }
  }, [id, organizationId, navigate, toast]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // Handle delete
  const handleDelete = async () => {
    if (!contact || !organizationId) return;

    try {
      await deleteContact(contact.id, organizationId);
      toast({
        title: 'Deleted',
        description: toastMessages.deleted('contact'),
      });
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
      await addContactActivity(
        contact.id,
        {
          type: 'note',
          title: 'Note added',
          content: { text: newNote.trim() },
        },
        organizationId
      );

      setNewNote('');
      // Refresh activities
      const activitiesData = await getContactActivities(contact.id, { limit: 50 }, organizationId);
      setActivities(activitiesData);

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
  const handleEmailSent = async () => {
    if (!contact || !organizationId) return;
    try {
      const activitiesData = await getContactActivities(contact.id, { limit: 50 }, organizationId);
      setActivities(activitiesData);
    } catch (error) {
      console.error('Error refreshing activities:', error);
    }
  };

  // Contact updated callback
  const handleContactUpdated = (updatedContact: Contact) => {
    setContact(updatedContact);
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

  const getStatusLabel = (status: string) =>
    status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());

  const getStatusIcon = (status: string) => {
    const StatusIcon = status === 'active'
      ? CheckCircle
      : status === 'inactive'
        ? AlertCircle
        : status === 'archived'
          ? Archive
          : null;

    return StatusIcon ? <StatusIcon className="h-3 w-3" aria-hidden="true" /> : null;
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
          <Edit className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
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

  if (!contact) {
    return null;
  }

  return (
    <PageLayout
      title="CONTACT"
      icon={<Users className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={backButton}
      desktopTools={{
        secondaryAction: contactActions,
        primaryAction: (
          <HeaderAction
            label="Create estimate"
            onClick={handleCreateEstimate}
            icon={<FileText className="h-4 w-4" />}
          />
        ),
      }}
      mobileActions={
        <>
          <Button
            size="sm"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-light"
            onClick={handleCreateEstimate}
          >
            <FileText className="mr-2 h-4 w-4" />
            Create estimate
          </Button>
        </>
      }
    >
        {/* Contact profile card */}
      <div className="mb-6 flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xl font-medium text-blue-700 dark:text-blue-300">
          {getInitials()}
        </div>
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium">{getContactName()}</h2>
            {contact.job_title && contact.company && (
              <p className="text-muted-foreground">
                {contact.job_title} at {contact.company}
              </p>
            )}
            {contact.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Badge
            className={`mt-2 shrink-0 gap-1 sm:mt-0 ${getContactStatusBadgeClass(contact.status)}`}
          >
            {getStatusIcon(contact.status)}
            {getStatusLabel(contact.status)}
          </Badge>
        </div>
      </div>

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
            <CardContent className="space-y-4">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
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
                    className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
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
            <CardContent className="grid gap-2 lg:grid-cols-2">
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
              <CardContent className="space-y-3">
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
              <CardContent>
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
          <CardContent className="flex min-h-0 flex-1 flex-col">
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
          <CardContent className="min-h-0 flex-1">
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
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Contact
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontFamily: '"Raleway", sans-serif' }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

export default ContactDetailPage;
