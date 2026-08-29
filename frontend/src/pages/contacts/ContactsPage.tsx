import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, MoreHorizontal, Trash2, Tag, UserPlus, Download, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  HeaderAction,
  HeaderActionLabel,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Contact, ContactsResponse } from '@/types';
import { getContacts, deleteContact, bulkDeleteContacts, exportContactsCSV, createContact, CreateContactData } from '@/services/contactsApi';
import { ContactsTable } from './components/ContactsTable';
import { ContactCardList } from './components/ContactCard';
import { ContactFilters } from './components/ContactFilters';
import { CreateContactModal } from './components/CreateContactModal';
import { ImportContactsModal } from './components/ImportContactsModal';
import { BulkTagModal } from './components/BulkTagModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganization } from '@/hooks/useOrganization';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getContactStatusVisual } from './constants/contactStatusConstants';

const getApiStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

export function ContactsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('contacts');

  const { organizationId, isLoading: orgLoading, error: initError } = useOrganization({
    onError: (error) => {
      return getApiStatus(error) === 500
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

  const queryClient = useQueryClient();
  const contactsQueryKey = useMemo(
    () => ['contacts', organizationId, searchQuery, statusFilter, pagination.page, pagination.limit],
    [organizationId, searchQuery, statusFilter, pagination.page, pagination.limit]
  );

  const { data: contactsData, isLoading: loading, refetch: fetchContacts } = useQuery({
    queryKey: contactsQueryKey,
    queryFn: () => getContacts({
      organization_id: organizationId!,
      search: searchQuery || undefined,
      status: statusFilter !== 'all' ? (statusFilter as 'active' | 'inactive' | 'archived') : undefined,
      page: pagination.page,
      limit: pagination.limit,
      sort_by: 'created_at',
      sort_order: 'desc',
    }),
    enabled: !!organizationId && !orgLoading,
  });

  const contacts = contactsData?.contacts ?? [];
  useEffect(() => {
    if (contactsData?.pagination) {
      setPagination(prev => ({ ...prev, ...contactsData.pagination }));
    }
  }, [contactsData?.pagination]);

  const createContactMutation = useMutation({
    mutationFn: (data: CreateContactData) => createContact(data),
    onMutate: async (newContact) => {
      await queryClient.cancelQueries({ queryKey: contactsQueryKey });
      const previous = queryClient.getQueryData<ContactsResponse>(contactsQueryKey);
      const tempContact: Contact = {
        id: -Date.now(),
        organization_id: organizationId!,
        first_name: newContact.first_name ?? '',
        last_name: newContact.last_name ?? '',
        email: newContact.email ?? '',
        phone: newContact.phone,
        company: newContact.company,
        job_title: newContact.job_title,
        address: {},
        source: 'manual',
        status: (newContact.status as 'active' | 'inactive' | 'archived') ?? 'active',
        custom_fields: {},
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ContactsResponse>(contactsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          contacts: [tempContact, ...old.contacts],
          pagination: { ...old.pagination, total: old.pagination.total + 1 },
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(contactsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contactsQueryKey });
    },
  });

  const contactStats = useMemo(() => {
    const total = contacts.length;
    const active = contacts.filter((contact) => contact.status === 'active').length;
    const inactive = contacts.filter((contact) => contact.status === 'inactive').length;
    const archived = contacts.filter((contact) => contact.status === 'archived').length;
    return { total, active, inactive, archived };
  }, [contacts]);

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

  const handleContactCreated = (contact: Contact) => {
    setShowCreateModal(false);
    toast({
      title: 'Created',
      description: toastMessages.created('contact'),
    });
  };

  // Handle contact click
  const handleContactClick = (contact: Contact) => {
    navigate(`/contacts/${contact.id}`);
  };

  const headerFilterCount = Number(statusFilter !== 'all');
  const headerQueryCount = headerFilterCount + Number(searchQuery.trim().length > 0);
  const headerFilters = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="h-11 w-[8.5rem] bg-muted/20">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Status</SelectItem>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
        <SelectItem value="archived">Archived</SelectItem>
      </SelectContent>
    </Select>
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
        <DropdownMenuItem onClick={() => setShowImportModal(true)} className="group/menu">
          <Upload className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
          Import CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => organizationId && exportContactsCSV(organizationId)}
          className="group/menu"
        >
          <Download className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
          Export CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Show error state if initialization failed
  if (initError) {
    return (
      <PageLayout
        title="CONTACTS"
        icon={<Users className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      >
        <ErrorState
          title="CRM Not Ready"
          description={initError}
          icon={UserPlus}
          onAction={() => void fetchContacts()}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="CONTACTS"
      icon={<Users className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      mobileClassName="flex-col items-stretch"
      desktopTools={{
        search: (
          <HeaderSearch
            label="Search contacts"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        ),
        filters: (
          <HeaderFilters label="Filter contacts" activeCount={headerFilterCount} preferExpanded>
            {headerFilters}
          </HeaderFilters>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter contacts"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={headerQueryCount}
          >
            {headerFilters}
          </HeaderCombinedQuery>
        ),
        secondaryAction: contactActions,
        primaryAction: (
          <HeaderAction
            label="Add contact"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          />
        ),
      }}
      mobileActions={
        <>
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
                  <Upload className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                  Import CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => organizationId && exportContactsCSV(organizationId)} className="group/menu">
                  <Download className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                  Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      }
    >
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.contacts}
      />
          <ResponsiveCardRail
            label="Contact status summary"
            desktopColumns="md:grid-cols-4"
            className="responsive-stat-summary"
          >
            <StatCard
              title="Archived Contacts"
              badgeText="Archived"
              value={contactStats.archived}
              icon={getContactStatusVisual('archived').icon}
              description={`${contactStats.archived} contact${contactStats.archived !== 1 ? 's' : ''}`}
              colorTheme={getContactStatusVisual('archived').theme}
              isLoading={loading}
            />
            <StatCard
              title="Total Contacts"
              badgeText="Total"
              value={contactStats.total}
              icon={Users}
              description={`${contactStats.total} contact${contactStats.total !== 1 ? 's' : ''}`}
              colorTheme="blue"
              isLoading={loading}
            />
            <StatCard
              title="Active Contacts"
              badgeText="Active"
              value={contactStats.active}
              icon={getContactStatusVisual('active').icon}
              description={`${contactStats.active} contact${contactStats.active !== 1 ? 's' : ''}`}
              colorTheme={getContactStatusVisual('active').theme}
              isLoading={loading}
            />
            <StatCard
              title="Inactive Contacts"
              badgeText="Inactive"
              value={contactStats.inactive}
              icon={getContactStatusVisual('inactive').icon}
              description={`${contactStats.inactive} contact${contactStats.inactive !== 1 ? 's' : ''}`}
              colorTheme={getContactStatusVisual('inactive').theme}
              isLoading={loading}
            />
          </ResponsiveCardRail>
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
                <EmptyState
                  icon={UserPlus}
                  title="No contacts yet"
                  description="Get started by adding your first contact"
                  actionLabel="Add Contact"
                  onAction={() => setShowCreateModal(true)}
                  className="p-12"
                />
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

      {showCreateModal && organizationId && (
        <CreateContactModal
          organizationId={organizationId}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleContactCreated}
          createContactAsync={createContactMutation.mutateAsync}
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
    </PageLayout>
  );
}

export default ContactsPage;
