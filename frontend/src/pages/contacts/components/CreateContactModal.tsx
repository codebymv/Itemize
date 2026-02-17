import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Contact } from '@/types';
import { createContact, CreateContactData } from '@/services/contactsApi';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { createContactFormSchema, type CreateContactFormValues } from '@/lib/formSchemas';
import logger from '@/lib/logger';

interface CreateContactModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
  /** When provided, used instead of createContact() for optimistic-update support */
  createContactAsync?: (data: CreateContactData) => Promise<Contact>;
}

export function CreateContactModal({
  organizationId,
  onClose,
  onCreated,
  createContactAsync,
}: CreateContactModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<CreateContactFormValues>({
    resolver: zodResolver(createContactFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      company: '',
      job_title: '',
      status: 'active',
      source: 'manual',
    },
  });

  const handleSubmit = async (values: CreateContactFormValues) => {
    setLoading(true);
    try {
      const contactData: CreateContactData = {
        ...values,
        organization_id: organizationId,
      };
      const doCreate = createContactAsync ?? createContact;
      const contact = await doCreate(contactData);
      onCreated(contact);
      form.reset();
    } catch (error: any) {
      logger.error('Error creating contact:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create contact',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Add New Contact
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a new contact in your CRM
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="first_name" style={{ fontFamily: '"Raleway", sans-serif' }}>First Name</FormLabel>
                    <FormControl>
                      <Input
                        id="first_name"
                        placeholder="John"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="last_name" style={{ fontFamily: '"Raleway", sans-serif' }}>Last Name</FormLabel>
                    <FormControl>
                      <Input
                        id="last_name"
                        placeholder="Doe"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel htmlFor="email" style={{ fontFamily: '"Raleway", sans-serif' }}>Email</FormLabel>
                  <FormControl>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel htmlFor="phone" style={{ fontFamily: '"Raleway", sans-serif' }}>Phone</FormLabel>
                  <FormControl>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="company" style={{ fontFamily: '"Raleway", sans-serif' }}>Company</FormLabel>
                    <FormControl>
                      <Input
                        id="company"
                        placeholder="Acme Inc."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="job_title"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="job_title" style={{ fontFamily: '"Raleway", sans-serif' }}>Job Title</FormLabel>
                    <FormControl>
                      <Input
                        id="job_title"
                        placeholder="CEO"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="status" style={{ fontFamily: '"Raleway", sans-serif' }}>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="source" style={{ fontFamily: '"Raleway", sans-serif' }}>Source</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Entry</SelectItem>
                        <SelectItem value="import">Import</SelectItem>
                        <SelectItem value="form">Web Form</SelectItem>
                        <SelectItem value="integration">Integration</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
                aria-label={loading ? 'Creating contact' : 'Create contact'}
              >
                {loading ? 'Creating...' : 'Create Contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactModal;
