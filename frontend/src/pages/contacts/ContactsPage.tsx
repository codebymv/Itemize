import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Plus, Search, Filter, MoreHorizontal, Trash2, Tag, UserPlus, Download, Upload } from 'lucide-react';
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
import { useHeader } from '@/contexts/HeaderContext';
import { Contact, ContactsResponse } from '@/types';
import { getContacts, deleteContact, bulkDeleteContacts, ensureDefaultOrganization, exportContactsCSV } from '@/services/contactsApi';
import { ContactsTable } from './components/ContactsTable';
import { ContactFilters } from './components/ContactFilters';
import { CreateContactModal } from './components/CreateContactModal';
import { ImportContactsModal } from './components/ImportContactsModal';
import { BulkTagModal } from './components/BulkTagModal';

export function ContactsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
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

  // Set header content following workspace pattern
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <h1
          className="text-xl font-semibold italic truncate ml-2"
          style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#374151' }}
        >
          CONTACTS
        </h1>
        <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
          {/* Desktop search */}
          <div className="relative hidden md:block w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 hidden sm:flex">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowImportModal(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => organizationId && exportContactsCSV(organizationId)}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Add Contact Button */}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Contact</span>
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [searchQuery, statusFilter, theme, setHeaderContent]);

  // Initialize organization
  useEffect(() => {
    const initOrg = async () => {
      try {
        const org = await ensureDefaultOrganization();
        setOrganizationId(org.id);
        setInitError(null);
      } catch (error: any) {
        console.error('Error initializing organization:', error);
        const errorMsg = error.response?.status === 500
          ? 'CRM database tables are not ready. Please restart your backend server to run migrations.'
          : 'Failed to initialize organization. Please check your connection.';
        setInitError(errorMsg);
        setLoading(false);
      }
    };
    initOrg();
  }, []);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!organizationId) return;

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
        description: 'Failed to load contacts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, searchQuery, statusFilter, pagination.page, pagination.limit]);

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
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
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
        title: 'Success',
        description: `${selectedContacts.length} contacts deleted`,
      });
      setSelectedContacts([]);
      fetchContacts();
    } catch (error) {
      console.error('Error bulk deleting contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete contacts',
        variant: 'destructive',
      });
    }
  };

  // Handle contact created
  const handleContactCreated = (contact: Contact) => {
    setShowCreateModal(false);
    toast({
      title: 'Success',
      description: 'Contact created successfully',
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
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="max-w-lg mx-auto mt-12">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <UserPlus className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-medium mb-2">CRM Not Ready</h3>
            <p className="text-muted-foreground mb-4">{initError}</p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Mobile controls (hidden on desktop since controls are in header) */}
      <div className="sm:hidden flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1">
              <Filter className="h-4 w-4 mr-2" />
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
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowImportModal(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => organizationId && exportContactsCSV(organizationId)}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
    </div>
  );
}

export default ContactsPage;
