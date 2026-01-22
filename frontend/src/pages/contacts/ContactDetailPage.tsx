import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  ArrowLeft,
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
  Palette,
  ListChecks,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useHeader } from '@/contexts/HeaderContext';
import { Contact, ContactActivity } from '@/types';
import {
  getContact,
  deleteContact,
  getContactActivities,
  addContactActivity,
  getContactContent,
  ensureDefaultOrganization,
} from '@/services/contactsApi';
import { ActivityTimeline } from './components/ActivityTimeline';
import { EditContactModal } from './components/EditContactModal';

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();

  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<ContactActivity[]>([]);
  const [relatedContent, setRelatedContent] = useState<{
    lists: any[];
    notes: any[];
    whiteboards: any[];
  }>({ lists: [], notes: [], whiteboards: [] });
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Helper function for contact name (used in header)
  const getContactDisplayName = (c: Contact | null) => {
    if (!c) return 'CONTACT';
    if (c.first_name || c.last_name) {
      return `${c.first_name || ''} ${c.last_name || ''}`.trim().toUpperCase();
    }
    return (c.email || c.company || 'CONTACT').toUpperCase();
  };

  // Set header content following workspace pattern
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate('/contacts')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 
            className="text-xl font-semibold italic truncate" 
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#374151' }}
          >
            {getContactDisplayName(contact)}
          </h1>
        </div>
        <div className="flex items-center gap-2 mr-4">
          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditModal(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Edit Button */}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => setShowEditModal(true)}
          >
            <Edit className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [contact, theme, navigate, setHeaderContent]);

  // Initialize organization
  useEffect(() => {
    const initOrg = async () => {
      try {
        const org = await ensureDefaultOrganization();
        setOrganizationId(org.id);
      } catch (error) {
        console.error('Error initializing organization:', error);
      }
    };
    initOrg();
  }, []);

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
        description: 'Failed to load contact',
        variant: 'destructive',
      });
      navigate('/contacts');
    } finally {
      setLoading(false);
    }
  }, [id, organizationId, navigate]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // Handle delete
  const handleDelete = async () => {
    if (!contact || !organizationId) return;

    try {
      await deleteContact(contact.id, organizationId);
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      navigate('/contacts');
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
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
        title: 'Success',
        description: 'Note added successfully',
      });
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        title: 'Error',
        description: 'Failed to add note',
        variant: 'destructive',
      });
    } finally {
      setAddingNote(false);
    }
  };

  // Contact updated callback
  const handleContactUpdated = (updatedContact: Contact) => {
    setContact(updatedContact);
    setShowEditModal(false);
    toast({
      title: 'Success',
      description: 'Contact updated successfully',
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

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
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
      </div>
    );
  }

  if (!contact) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Contact profile card */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xl font-medium text-blue-700 dark:text-blue-300">
          {getInitials()}
        </div>
        <div>
          <h2 className="text-xl font-medium">{getContactName()}</h2>
          {contact.job_title && contact.company && (
            <p className="text-muted-foreground">
              {contact.job_title} at {contact.company}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={contact.status === 'active' ? 'default' : 'secondary'}
              className={contact.status === 'active' ? 'bg-green-500' : ''}
            >
              {contact.status}
            </Badge>
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column - Details & Activity */}
        <div className="md:col-span-2 space-y-6">
          {/* Contact info card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-blue-600 hover:underline"
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

          {/* Activity tabs */}
          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="content">Related Content</TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="mt-4">
              {/* Add note form */}
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="mb-2"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                  >
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </Button>
                </CardContent>
              </Card>

              {/* Activity timeline */}
              <ActivityTimeline activities={activities} />
            </TabsContent>

            <TabsContent value="content" className="mt-4 space-y-4">
              {/* Lists */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ListChecks className="h-4 w-4" />
                      Lists
                    </CardTitle>
                    <Button variant="ghost" size="sm" disabled>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {relatedContent.lists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lists linked to this contact</p>
                  ) : (
                    <div className="space-y-2">
                      {relatedContent.lists.map((list) => (
                        <div
                          key={list.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                        >
                          <span className="text-sm">{list.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {list.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Notes
                    </CardTitle>
                    <Button variant="ghost" size="sm" disabled>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {relatedContent.notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notes linked to this contact</p>
                  ) : (
                    <div className="space-y-2">
                      {relatedContent.notes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                        >
                          <span className="text-sm">{note.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {note.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Whiteboards */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Whiteboards
                    </CardTitle>
                    <Button variant="ghost" size="sm" disabled>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {relatedContent.whiteboards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No whiteboards linked to this contact</p>
                  ) : (
                    <div className="space-y-2">
                      {relatedContent.whiteboards.map((wb) => (
                        <div
                          key={wb.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                        >
                          <span className="text-sm">{wb.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {wb.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column - Quick info */}
        <div className="space-y-6">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {contact.email && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href={`mailto:${contact.email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </a>
                </Button>
              )}
              {contact.phone && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href={`tel:${contact.phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </a>
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start" disabled>
                <CheckSquare className="h-4 w-4 mr-2" />
                Create Task
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
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ContactDetailPage;
