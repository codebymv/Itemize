import React, { useState } from 'react';
import { MoreHorizontal, Trash2, Edit, Eye, Mail, Phone } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { Contact } from '@/types';

interface ContactsTableProps {
  contacts: Contact[];
  selectedContacts: number[];
  onSelectContact: (id: number, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onContactClick: (contact: Contact) => void;
  onDeleteContact: (id: number) => void;
}

export function ContactsTable({
  contacts,
  selectedContacts,
  onSelectContact,
  onSelectAll,
  onContactClick,
  onDeleteContact,
}: ContactsTableProps) {
  const [deleteContactId, setDeleteContactId] = useState<number | null>(null);
  const allSelected = contacts.length > 0 && selectedContacts.length === contacts.length;
  const someSelected = selectedContacts.length > 0 && selectedContacts.length < contacts.length;

  const getContactName = (contact: Contact) => {
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    }
    return contact.email || contact.company || 'Unnamed Contact';
  };

  const getInitials = (contact: Contact) => {
    const name = getContactName(contact);
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className={getContactStatusBadgeClasses('active')}>Active</Badge>;
      case 'inactive':
        return <Badge className={getContactStatusBadgeClasses('inactive')}>Inactive</Badge>;
      case 'archived':
        return <Badge className={getContactStatusBadgeClasses('archived')}>Archived</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) {
                  (el as any).indeterminate = someSelected;
                }
              }}
              onCheckedChange={onSelectAll}
            />
          </TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <TableRow
            key={contact.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onContactClick(contact)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedContacts.includes(contact.id)}
                onCheckedChange={(checked) => onSelectContact(contact.id, !!checked)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm font-medium text-blue-700 dark:text-blue-300">
                  {getInitials(contact)}
                </div>
                <div>
                  <div className="font-medium">{getContactName(contact)}</div>
                  {contact.job_title && (
                    <div className="text-sm text-muted-foreground">{contact.job_title}</div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">{contact.company || '—'}</span>
            </TableCell>
            <TableCell>
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Mail className="h-3 w-3" />
                  {contact.email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Phone className="h-3 w-3" />
                  {contact.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>{getStatusBadge(contact.status)}</TableCell>
            <TableCell>
              <span className="text-muted-foreground text-sm">
                {formatDate(contact.created_at)}
              </span>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onContactClick(contact)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onContactClick(contact)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteContactId(contact.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>

    <DeleteDialog
      open={deleteContactId !== null}
      onOpenChange={(open) => !open && setDeleteContactId(null)}
      onConfirm={async () => {
        if (deleteContactId) {
          onDeleteContact(deleteContactId);
          setDeleteContactId(null);
        }
      }}
      itemType="contact"
      itemTitle={contacts.find(c => c.id === deleteContactId) ? 
        `${contacts.find(c => c.id === deleteContactId)?.first_name || ''} ${contacts.find(c => c.id === deleteContactId)?.last_name || ''}`.trim() || 
        contacts.find(c => c.id === deleteContactId)?.email : undefined}
    />
    </>
  );
}

export default ContactsTable;
