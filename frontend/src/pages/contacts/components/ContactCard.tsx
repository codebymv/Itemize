import React from 'react';
import { Mail, Phone, MoreHorizontal, Trash2, Edit, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Contact } from '@/types';

interface ContactCardProps {
    contact: Contact;
    isSelected: boolean;
    onSelect: (id: number, selected: boolean) => void;
    onClick: (contact: Contact) => void;
    onDelete: (id: number) => void;
}

export function ContactCard({
    contact,
    isSelected,
    onSelect,
    onClick,
    onDelete,
}: ContactCardProps) {
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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="default" className="bg-green-500 text-xs">Active</Badge>;
            case 'inactive':
                return <Badge variant="secondary" className="text-xs">Inactive</Badge>;
            case 'archived':
                return <Badge variant="outline" className="text-xs">Archived</Badge>;
            default:
                return null;
        }
    };

    return (
        <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onClick(contact)}
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
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="font-medium text-base truncate">
                                    {getContactName()}
                                </h3>
                                {contact.job_title && (
                                    <p className="text-sm text-muted-foreground truncate">
                                        {contact.job_title}
                                    </p>
                                )}
                                {contact.company && (
                                    <p className="text-sm text-muted-foreground truncate">
                                        {contact.company}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {getStatusBadge(contact.status)}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(contact); }} className="group/menu">
                                            <Eye className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                            View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(contact); }} className="group/menu">
                                            <Edit className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                                            Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm('Are you sure you want to delete this contact?')) {
                                                    onDelete(contact.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-3 mt-3" onClick={(e) => e.stopPropagation()}>
                            {contact.email && (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                                >
                                    <Mail className="h-4 w-4" />
                                    <span className="truncate max-w-[120px]">{contact.email}</span>
                                </a>
                            )}
                            {contact.phone && (
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                                >
                                    <Phone className="h-4 w-4" />
                                    <span>{contact.phone}</span>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
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
    return (
        <div className="space-y-3 p-4">
            {contacts.map((contact) => (
                <ContactCard
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContacts.includes(contact.id)}
                    onSelect={onSelectContact}
                    onClick={onContactClick}
                    onDelete={onDeleteContact}
                />
            ))}
        </div>
    );
}

export default ContactCard;
