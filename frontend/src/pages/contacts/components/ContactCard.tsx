import React, { useState } from 'react';
import { Mail, Phone, MoreHorizontal, Trash2, Edit, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { Contact } from '@/types';

interface ContactCardProps {
    contact: Contact;
    isSelected: boolean;
    isExpanded: boolean;
    onSelect: (id: number, selected: boolean) => void;
    onClick: (contact: Contact) => void;
    onDelete: (id: number) => void;
    onToggleExpand: (id: number) => void;
}

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

    const getContactName = () => {
        if (contact.first_name || contact.last_name) {
            return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        }
        return contact.email || contact.company || 'Unnamed Contact';
    };

    const getInitials = () => {
        const name = getContactName();
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const getAddressLine = () => {
        if (!contact.address) return '';
        const { street, city, state, zip, country } = contact.address;
        return [street, city, state, zip, country].filter(Boolean).join(', ');
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
                return <Badge className={`text-xs ${getContactStatusBadgeClasses('active')}`}>Active</Badge>;
            case 'inactive':
                return <Badge className={`text-xs ${getContactStatusBadgeClasses('inactive')}`}>Inactive</Badge>;
            case 'archived':
                return <Badge className={`text-xs ${getContactStatusBadgeClasses('archived')}`}>Archived</Badge>;
            default:
                return null;
        }
    };

    return (
        <>
        <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onToggleExpand(contact.id)}
        >
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div
                        className="pt-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => onSelect(contact.id, !!checked)}
                        />
                    </div>

                    {/* Avatar */}
                    <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm font-medium text-blue-700 dark:text-blue-300 flex-shrink-0">
                        {getInitials()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {/* Header Row: Name on left, controls on right */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-medium text-sm md:text-base truncate">
                                    {getContactName()}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleExpand(contact.id);
                                    }}
                                >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClick(contact);
                                            }}
                                            className="group/menu"
                                        >
                                            <Edit className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                            Edit
                                        </DropdownMenuItem>
                                        {contact.email && (
                                            <DropdownMenuItem className="group/menu" asChild>
                                                <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()}>
                                                    <Mail className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                                    Email
                                                </a>
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteDialogOpen(true);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Middle Row: Company/Role + Status */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                            {(contact.company || contact.job_title) && (
                                <span className="text-sm text-muted-foreground truncate max-w-full">
                                    {contact.company || 'Company'}
                                    {contact.job_title && ` • ${contact.job_title}`}
                                </span>
                            )}
                            {getStatusBadge(contact.status)}
                        </div>

                        {/* Footer Row: Email + Phone */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                            {contact.email && (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="flex items-center gap-1.5 text-muted-foreground hover:underline max-w-full"
                                >
                                    <Mail className="h-4 w-4 flex-shrink-0 text-blue-600" />
                                    <span className="truncate max-w-[180px]">{contact.email}</span>
                                </a>
                            )}
                            {contact.phone && (
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="flex items-center gap-1.5 text-muted-foreground hover:underline max-w-full"
                                >
                                    <Phone className="h-4 w-4 flex-shrink-0 text-blue-600" />
                                    <span className="truncate max-w-[150px]">{contact.phone}</span>
                                </a>
                            )}
                        </div>

                        {isExpanded && (
                            <div className="mt-4 -mx-4 px-4 py-4 border-t bg-muted/30 w-full" onClick={(e) => e.stopPropagation()}>
                                <div className="grid gap-2 text-sm text-muted-foreground w-full">
                                    {getAddressLine() && (
                                        <div className="flex items-start gap-2">
                                            <span className="mt-0.5 text-xs font-medium text-muted-foreground">Address</span>
                                            <span className="text-sm">{getAddressLine()}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4 pt-4 border-t w-full">
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
                                        Edit
                                    </Button>
                                    {contact.email && (
                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm" asChild>
                                            <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()}>
                                                <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                                Email
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
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>

        <DeleteDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onConfirm={async () => {
                onDelete(contact.id);
                setDeleteDialogOpen(false);
            }}
            itemType="contact"
            itemTitle={getContactName()}
        />
        </>
    );
}

interface ContactCardListProps {
    contacts: Contact[];
    selectedContacts: number[];
    onSelectContact: (id: number, selected: boolean) => void;
    onContactClick: (contact: Contact) => void;
    onDeleteContact: (id: number) => void;
}

export function ContactCardList({
    contacts,
    selectedContacts,
    onSelectContact,
    onContactClick,
    onDeleteContact,
}: ContactCardListProps) {
    const [expandedContactId, setExpandedContactId] = React.useState<number | null>(null);

    const handleToggleExpand = (contactId: number) => {
        setExpandedContactId((prev) => (prev === contactId ? null : contactId));
    };

    return (
        <div className="space-y-3 p-4">
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
