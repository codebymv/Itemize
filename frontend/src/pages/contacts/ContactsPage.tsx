import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, MoreHorizontal, Trash2, Tag, UserPlus, Download, Upload, Users, CheckCircle, AlertCircle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { usePageHeader } from '@/hooks/usePageHeader';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Contact, ContactsResponse } from '@/types';
import { getContacts, deleteContact, bulkDeleteContacts, exportContactsCSV } from '@/services/contactsApi';
import { ContactsTable } from './components/ContactsTable';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { ContactCardList } from './components/ContactCard';
import { ContactFilters } from './components/ContactFilters';
import { CreateContactModal } from './components/CreateContactModal';
import { ImportContactsModal } from './components/ImportContactsModal';
import { BulkTagModal } from './components/BulkTagModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganization } from '@/hooks/useOrganization';

// Color helper functions for contact status badges and summary cards
const getContactStatusBadgeClasses = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'inactive':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'archived':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default:
      return '';
  }
};

const getStatBadgeClasses = (theme: string) => {
  switch (theme) {
    case 'green':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'orange':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'blue':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300';
    case 'red':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'gray':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getStatIconBgClasses = (theme: string) => {
  switch (theme) {
    case 'green':
      return 'bg-green-100 dark:bg-green-900';
    case 'orange':
      return 'bg-orange-100 dark:bg-orange-900';
    case 'blue':
      return 'bg-sky-100 dark:bg-sky-900';
    case 'red':
      return 'bg-red-100 dark:bg-red-900';
    case 'gray':
      return 'bg-gray-100 dark:bg-gray-800';
    default:
      return 'bg-gray-100 dark:bg-gray-800';
  }
};

const getStatValueColor = (theme: string) => {
  switch (theme) {
    case 'green':
      return 'text-green-600';
    case 'orange':
      return 'text-orange-600';
    case 'blue':
      return 'text-sky-600';
    case 'red':
      return 'text-red-600';
    case 'gray':
      return 'text-gray-600';
    default:
      return 'text-gray-600';
  }
};

const getStatIconColor = (theme: string) => {
  switch (theme) {
    case 'green':
      return 'text-green-600 dark:text-green-400';
    case 'orange':
      return 'text-orange-600 dark:text-orange-400';
    case 'blue':
      return 'text-sky-600 dark:text-sky-400';
    case 'red':
      return 'text-red-600 dark:text-red-400';
    case 'gray':
      return 'text-gray-400 dark:text-gray-500';
    default:
      return 'text-gray-400 dark:text-gray-500';
  }
};

export function ContactsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('contacts');

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const { organizationId, isLoading: orgLoading, error: initError } = useOrganization({
    onError: (error: any) => {
      return error?.response?.status === 500
        ? 'CRM database tables are not ready. Please restart your backend server to run migrations.'
        : 'Failed to initialize organization. Please check your connection.';
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const contactStats = useMemo(() => {
    const total = contacts.length;
    const active = contacts.filter((contact) => contact.status === 'active').length;
    const inactive = contacts.filter((contact) => contact.status === 'inactive').length;
    const archived = contacts.filter((contact) => contact.status === 'archived').length;
    return { total, active, inactive, archived };
  }, [contacts]);

  usePageHeader(
    {
      title: 'CONTACTS',
      icon: <Users className="h-5 w-5 text-blue-600 flex-shrink-0" />,
      rightContent: (
        <>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors font-raleway"
              aria-label="Search contacts"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowImportModal(true)} className="group/menu">
                <Upload className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => organizationId && exportContactsCSV(organizationId)} className="group/menu">
                <Download className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </>
      ),
      theme
    },
    [searchQuery, statusFilter, theme, organizationId]
  );

  useEffect(() => {
    if (orgLoading) {
      setLoading(true);
      return;
    }

    if (!organizationId) {
      setLoading(false);
    }
  }, [orgLoading, organizationId, initError]);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!organizationId) {
      if (!orgLoading) {
        setContacts([]);
        setPagination(prev => ({ ...prev, total: 0, totalPages: 1 }));
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await getContacts({
        organization_id: organizationId,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter as any : undefined,
        page: pagination.page,
        limit: pagination.limit,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      setContacts(response.contacts);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToLoad('contacts'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, orgLoading, searchQuery, statusFilter, pagination.page, pagination.limit, toast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (organizationId) {
        setPagination(prev => ({ ...prev, page: 1 }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle contact selection
  const handleSelectContact = (contactId: number, selected: boolean) => {
    setSelectedContacts(prev =>
      selected
        ? [...prev, contactId]
        : prev.filter(id => id !== contactId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedContacts(selected ? contacts.map(c => c.id) : []);
  };

  // Handle delete
  const handleDeleteContact = async (id: number) => {
    if (!organizationId) return;

    try {
      await deleteContact(id, organizationId);
      toast({
        title: 'Deleted',
        description: toastMessages.deleted('contact'),
      });
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToDelete('contact'),
        variant: 'destructive',
      });
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (!organizationId || selectedContacts.length === 0) return;

    try {
      await bulkDeleteContacts(selectedContacts, organizationId);
      toast({
        title: 'Deleted',
        description: `${selectedContacts.length} contacts deleted successfully`,
      });
      setSelectedContacts([]);
      fetchContacts();
    } catch (error) {
      console.error('Error bulk deleting contacts:', error);
      toast({
        title: 'Error',
        description: toastMessages.failedToDelete('contacts'),
        variant: 'destructive',
      });
    }
  };

  // Handle contact created
  const handleContactCreated = (contact: Contact) => {
    setShowCreateModal(false);
    toast({
      title: 'Created',
      description: toastMessages.created('contact'),
    });
    fetchContacts();
  };

  // Handle contact click
  const handleContactClick = (contact: Contact) => {
    navigate(`/contacts/${contact.id}`);
  };

  // Show error state if initialization failed
  if (initError) {
    return (
      <PageContainer>
        <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="pt-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-medium mb-2">CRM Not Ready</h3>
          <p className="text-muted-foreground mb-4">{initError}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </PageSurface>
      </PageContainer>
    );
  }

  return (
    <>
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.contacts}
      />

      {/* Mobile Controls Bar */}
      <MobileControlsBar className="flex-col items-stretch">
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 w-full bg-muted/20 border-border/50"
            />
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-light"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 w-full">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowImportModal(true)} className="group/menu">
                <Upload className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => organizationId && exportContactsCSV(organizationId)} className="group/menu">
                <Download className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </MobileControlsBar>

      <PageContainer>
        <PageSurface>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('red')}`}>Archived</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('red')}`}>{contactStats.archived}</p>
                    <p className="text-xs text-muted-foreground">
                      {contactStats.archived} contact{contactStats.archived !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('red')}`}>
                    <Archive className={`h-5 w-5 ${getStatIconColor('red')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('blue')}`}>Total</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('blue')}`}>{contactStats.total}</p>
                    <p className="text-xs text-muted-foreground">
                      {contactStats.total} contact{contactStats.total !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('blue')}`}>
                    <Users className={`h-5 w-5 ${getStatIconColor('blue')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('green')}`}>Active</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('green')}`}>{contactStats.active}</p>
                    <p className="text-xs text-muted-foreground">
                      {contactStats.active} contact{contactStats.active !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('green')}`}>
                    <CheckCircle className={`h-5 w-5 ${getStatIconColor('green')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('orange')}`}>Inactive</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('orange')}`}>{contactStats.inactive}</p>
                    <p className="text-xs text-muted-foreground">
                      {contactStats.inactive} contact{contactStats.inactive !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('orange')}`}>
                    <AlertCircle className={`h-5 w-5 ${getStatIconColor('orange')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {/* Bulk actions */}
          {selectedContacts.length > 0 && (
            <Card className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowBulkTagModal(true)}>
                      <Tag className="h-4 w-4 mr-2" />
                      Tag
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contacts table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <UserPlus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No contacts yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by adding your first contact
                  </p>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
              ) : isMobile ? (
                <ContactCardList
                  contacts={contacts}
                  selectedContacts={selectedContacts}
                  onSelectContact={handleSelectContact}
                  onContactClick={handleContactClick}
                  onDeleteContact={handleDeleteContact}
                />
              ) : (
                <ContactsTable
                  contacts={contacts}
                  selectedContacts={selectedContacts}
                  onSelectContact={handleSelectContact}
                  onSelectAll={handleSelectAll}
                  onContactClick={handleContactClick}
                  onDeleteContact={handleDeleteContact}
                />
              )}
            </CardContent>
          </Card>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} contacts
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        </PageSurface>

      {/* Create contact modal */}
      {showCreateModal && organizationId && (
        <CreateContactModal
          organizationId={organizationId}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleContactCreated}
        />
      )}

      {/* Import contacts modal */}
      {showImportModal && organizationId && (
        <ImportContactsModal
          organizationId={organizationId}
          onClose={() => setShowImportModal(false)}
          onImported={fetchContacts}
        />
      )}

      {/* Bulk tag modal */}
      {showBulkTagModal && organizationId && (
        <BulkTagModal
          selectedContactIds={selectedContacts}
          organizationId={organizationId}
          onClose={() => setShowBulkTagModal(false)}
          onCompleted={() => {
            setSelectedContacts([]);
            fetchContacts();
          }}
        />
      )}
      </PageContainer>
    </>
  );
}

export default ContactsPage;
