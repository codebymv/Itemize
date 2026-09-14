import React, { useState } from 'react';
import { Mail, Phone, MoreHorizontal, Trash2, Edit, ChevronDown, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ContactStatusIconBadge } from './ContactStatusIconBadge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { ExpandedRowHeader } from '@/components/ui/expanded-row-header';
import { Contact } from '@/types';

const getContactName = (contact: Contact) => {
    if (contact.first_name || contact.last_name) {
        return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    }
    return contact.email || contact.company || 'Unnamed Contact';
};

const getInitials = (contact: Contact) =>
    getContactName(contact)
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

const formatCreated = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface ContactCardProps {
    contact: Contact;
    isSelected: boolean;
    isExpanded: boolean;
    onSelect: (id: number, selected: boolean) => void;
    onClick: (contact: Contact) => void;
    onDelete: (id: number) => void;
    onToggleExpand: (id: number) => void;
}

/**
 * One contact as an expandable list row. The same markup serves every width:
 * status and the created date hand off from the command lane to the meta and
 * footer rows on the row's own width (`ExpandedRowHeader`), so the list never
 * needs a separate table and card implementation.
 */
export function ContactCard({
    contact,
    isSelected,
    isExpanded,
    onSelect,
    onClick,
    onDelete,
    onToggleExpand,
}: ContactCardProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const name = getContactName(contact);

    const getAddressLine = () => {
        if (!contact.address) return '';
        const { street, city, state, zip, country } = contact.address;
        return [street, city, state, zip, country].filter(Boolean).join(', ');
    };

    return (
        <>
        <div data-contact-row={contact.id}>
            <div
                className="group cursor-pointer p-4 interaction-row"
                onClick={() => onToggleExpand(contact.id)}
            >
                <ExpandedRowHeader
                    leading={(
                        <>
                            <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                    aria-label={`Select ${name}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => onSelect(contact.id, !!checked)}
                                />
                            </span>
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-theme-tint text-sm font-medium text-primary dark:text-icon-accent @[40rem]:h-10 @[40rem]:w-10">
                                {getInitials(contact)}
                            </div>
                        </>
                    )}
                    title={name}
                    status={<ContactStatusIconBadge status={contact.status} />}
                    value={<span className="text-sm text-muted-foreground">Added {formatCreated(contact.created_at)}</span>}
                    trailing={(
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleExpand(contact.id);
                                }}
                            >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`More actions for ${name}`}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuItem onClick={() => onClick(contact)} className="group/menu">
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onClick(contact)} className="group/menu">
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                    </DropdownMenuItem>
                                    {contact.email && (
                                        <DropdownMenuItem className="group/menu" asChild>
                                            <a href={`mailto:${contact.email}`}>
                                                <Mail className="mr-2 h-4 w-4" />
                                                Email
                                            </a>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setDeleteDialogOpen(true)}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                    meta={(contact.company || contact.job_title) ? (
                        <span className="min-w-0 text-sm text-muted-foreground">
                            {contact.company || 'Company'}
                            {contact.job_title && ` • ${contact.job_title}`}
                        </span>
                    ) : null}
                    footer={(contact.email || contact.phone) ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm" onClick={(e) => e.stopPropagation()}>
                            {contact.email && (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="touch-target-mobile flex min-w-0 touch-manipulation items-center gap-1.5 text-muted-foreground hover:underline"
                                >
                                    <Mail className="h-4 w-4 flex-shrink-0 text-icon-accent" />
                                    <span className="min-w-0 break-all">{contact.email}</span>
                                </a>
                            )}
                            {contact.phone && (
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="touch-target-mobile flex touch-manipulation items-center gap-1.5 text-muted-foreground hover:underline"
                                >
                                    <Phone className="h-4 w-4 flex-shrink-0 text-icon-accent" />
                                    <span>{contact.phone}</span>
                                </a>
                            )}
                        </span>
                    ) : null}
                />
            </div>

            {isExpanded && (
                <div className="border-t bg-muted/30 px-6 py-6" onClick={(e) => e.stopPropagation()}>
                    <ExpandedRowActions className="w-full">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick(contact);
                            }}
                            className="text-xs sm:text-sm"
                        >
                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            <ExpandedRowActionLabel full="Edit contact" compact="Edit" />
                        </Button>
                        {contact.email && (
                            <Button size="sm" className="bg-primary interaction-button--primary text-primary-foreground text-xs sm:text-sm" asChild>
                                <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()}>
                                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                    <ExpandedRowActionLabel full="Email contact" compact="Email" />
                                </a>
                            </Button>
                        )}
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteDialogOpen(true);
                            }}
                            className="text-xs sm:text-sm"
                        >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            <ExpandedRowActionLabel full="Delete contact" compact="Delete" />
                        </Button>
                    </ExpandedRowActions>

                    <div className="grid w-full gap-2 text-sm text-muted-foreground">
                        {getAddressLine() && (
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-xs font-medium text-muted-foreground">Address</span>
                                <span className="text-sm">{getAddressLine()}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        <DeleteDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onConfirm={async () => {
                onDelete(contact.id);
                setDeleteDialogOpen(false);
            }}
            itemType="contact"
            itemTitle={name}
        />
        </>
    );
}

interface ContactCardListProps {
    contacts: Contact[];
    selectedContacts: number[];
    onSelectContact: (id: number, selected: boolean) => void;
    onSelectAll?: (selected: boolean) => void;
    onContactClick: (contact: Contact) => void;
    onDeleteContact: (id: number) => void;
}

/** The contacts list: one expandable row per contact at every width. */
export function ContactCardList({
    contacts,
    selectedContacts,
    onSelectContact,
    onSelectAll,
    onContactClick,
    onDeleteContact,
}: ContactCardListProps) {
    const [expandedContactId, setExpandedContactId] = React.useState<number | null>(null);
    const allSelected = contacts.length > 0 && selectedContacts.length === contacts.length;
    const someSelected = selectedContacts.length > 0 && selectedContacts.length < contacts.length;

    const handleToggleExpand = (contactId: number) => {
        setExpandedContactId((prev) => (prev === contactId ? null : contactId));
    };

    return (
        <div className="divide-y" data-contact-list>
            {onSelectAll ? (
                <div className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
                    <Checkbox
                        aria-label="Select all contacts"
                        checked={allSelected}
                        ref={(el) => {
                            if (el) {
                                (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected;
                            }
                        }}
                        onCheckedChange={(checked) => onSelectAll(!!checked)}
                    />
                    <span>
                        {selectedContacts.length > 0
                            ? `${selectedContacts.length} of ${contacts.length} selected`
                            : `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`}
                    </span>
                </div>
            ) : null}
            {contacts.map((contact) => (
                <ContactCard
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContacts.includes(contact.id)}
                    isExpanded={expandedContactId === contact.id}
                    onSelect={onSelectContact}
                    onClick={onContactClick}
                    onDelete={onDeleteContact}
                    onToggleExpand={handleToggleExpand}
                />
            ))}
        </div>
    );
}

export default ContactCard;
