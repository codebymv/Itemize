import React, { useState } from 'react';
import { 
  Trash2, 
  CheckSquare, 
  StickyNote, 
  Palette, 
  AlertTriangle, 
  GitBranch, 
  KeyRound,
  FileText,
  Users,
  Mail,
  MessageSquare,
  Calendar,
  Layout,
  Star,
  Package,
  Receipt,
  Clock,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from './alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from './Spinner';

// Predefined item type configurations
type PredefinedItemType = 
  | 'list' 
  | 'note' 
  | 'whiteboard' 
  | 'wireframe' 
  | 'vault'
  | 'contact'
  | 'deal'
  | 'template'
  | 'email-template'
  | 'sms-template'
  | 'calendar'
  | 'page'
  | 'version'
  | 'widget'
  | 'review-request'
  | 'product'
  | 'invoice'
  | 'estimate'
  | 'document'
  | 'campaign'
  | 'segment'
  | 'form'
  | 'workflow'
  | 'generic';

interface ItemConfig {
  icon: LucideIcon;
  typeLabel: string;
  description: string;
  successTitle: string;
  successDescription: string;
  errorDescription: string;
}

const ITEM_CONFIGS: Record<PredefinedItemType, ItemConfig> = {
  list: {
    icon: CheckSquare,
    typeLabel: 'List',
    description: 'Deletes this list and its items. Cannot be undone.',
    successTitle: 'List deleted',
    successDescription: 'The list has been permanently deleted.',
    errorDescription: 'Failed to delete the list. Please try again.',
  },
  note: {
    icon: StickyNote,
    typeLabel: 'Note',
    description: 'Deletes this note and its content. Cannot be undone.',
    successTitle: 'Note deleted',
    successDescription: 'The note has been permanently deleted.',
    errorDescription: 'Failed to delete the note. Please try again.',
  },
  whiteboard: {
    icon: Palette,
    typeLabel: 'Whiteboard',
    description: 'Deletes this whiteboard and its content. Cannot be undone.',
    successTitle: 'Whiteboard deleted',
    successDescription: 'The whiteboard has been permanently deleted.',
    errorDescription: 'Failed to delete the whiteboard. Please try again.',
  },
  wireframe: {
    icon: GitBranch,
    typeLabel: 'Wireframe',
    description: 'Deletes this wireframe and diagram data. Cannot be undone.',
    successTitle: 'Wireframe deleted',
    successDescription: 'The wireframe has been permanently deleted.',
    errorDescription: 'Failed to delete the wireframe. Please try again.',
  },
  vault: {
    icon: KeyRound,
    typeLabel: 'Vault',
    description: 'Deletes this vault and encrypted contents. Cannot be undone.',
    successTitle: 'Vault deleted',
    successDescription: 'The vault and all its contents have been permanently deleted.',
    errorDescription: 'Failed to delete the vault. Please try again.',
  },
  contact: {
    icon: Users,
    typeLabel: 'Contact',
    description: 'Deletes this contact and related data. Cannot be undone.',
    successTitle: 'Contact deleted',
    successDescription: 'The contact has been permanently deleted.',
    errorDescription: 'Failed to delete the contact. Please try again.',
  },
  deal: {
    icon: Receipt,
    typeLabel: 'Deal',
    description: 'Deletes this deal. Cannot be undone.',
    successTitle: 'Deal deleted',
    successDescription: 'The deal has been permanently deleted.',
    errorDescription: 'Failed to delete the deal. Please try again.',
  },
  template: {
    icon: FileText,
    typeLabel: 'Template',
    description: 'Deletes this template. Cannot be undone.',
    successTitle: 'Template deleted',
    successDescription: 'The template has been permanently deleted.',
    errorDescription: 'Failed to delete the template. Please try again.',
  },
  'email-template': {
    icon: Mail,
    typeLabel: 'Email Template',
    description: 'Deletes this email template. Cannot be undone.',
    successTitle: 'Email template deleted',
    successDescription: 'The email template has been permanently deleted.',
    errorDescription: 'Failed to delete the email template. Please try again.',
  },
  'sms-template': {
    icon: MessageSquare,
    typeLabel: 'SMS Template',
    description: 'Deletes this SMS template. Cannot be undone.',
    successTitle: 'SMS template deleted',
    successDescription: 'The SMS template has been permanently deleted.',
    errorDescription: 'Failed to delete the SMS template. Please try again.',
  },
  calendar: {
    icon: Calendar,
    typeLabel: 'Calendar',
    description: 'Deletes this calendar and its events. Cannot be undone.',
    successTitle: 'Calendar deleted',
    successDescription: 'The calendar has been permanently deleted.',
    errorDescription: 'Failed to delete the calendar. Please try again.',
  },
  page: {
    icon: Layout,
    typeLabel: 'Page',
    description: 'Deletes this page. Cannot be undone.',
    successTitle: 'Page deleted',
    successDescription: 'The page has been permanently deleted.',
    errorDescription: 'Failed to delete the page. Please try again.',
  },
  version: {
    icon: Clock,
    typeLabel: 'Version',
    description: 'Deletes this version. Cannot be undone.',
    successTitle: 'Version deleted',
    successDescription: 'The version has been permanently deleted.',
    errorDescription: 'Failed to delete the version. Please try again.',
  },
  widget: {
    icon: Layout,
    typeLabel: 'Widget',
    description: 'Deletes this widget. Cannot be undone.',
    successTitle: 'Widget deleted',
    successDescription: 'The widget has been permanently deleted.',
    errorDescription: 'Failed to delete the widget. Please try again.',
  },
  'review-request': {
    icon: Star,
    typeLabel: 'Review Request',
    description: 'Deletes this review request. Cannot be undone.',
    successTitle: 'Review request deleted',
    successDescription: 'The review request has been permanently deleted.',
    errorDescription: 'Failed to delete the review request. Please try again.',
  },
  product: {
    icon: Package,
    typeLabel: 'Product',
    description: 'Deletes this product. Cannot be undone.',
    successTitle: 'Product deleted',
    successDescription: 'The product has been permanently deleted.',
    errorDescription: 'Failed to delete the product. Please try again.',
  },
  invoice: {
    icon: Receipt,
    typeLabel: 'Invoice',
    description: 'Deletes this invoice. Cannot be undone.',
    successTitle: 'Invoice deleted',
    successDescription: 'The invoice has been permanently deleted.',
    errorDescription: 'Failed to delete the invoice. Please try again.',
  },
  estimate: {
    icon: FileText,
    typeLabel: 'Estimate',
    description: 'Deletes this estimate. Cannot be undone.',
    successTitle: 'Estimate deleted',
    successDescription: 'The estimate has been permanently deleted.',
    errorDescription: 'Failed to delete the estimate. Please try again.',
  },
  document: {
    icon: FileText,
    typeLabel: 'Document',
    description: 'Deletes this document. Cannot be undone.',
    successTitle: 'Document deleted',
    successDescription: 'The document has been permanently deleted.',
    errorDescription: 'Failed to delete the document. Please try again.',
  },
  campaign: {
    icon: Mail,
    typeLabel: 'Campaign',
    description: 'Deletes this campaign. Cannot be undone.',
    successTitle: 'Campaign deleted',
    successDescription: 'The campaign has been permanently deleted.',
    errorDescription: 'Failed to delete the campaign. Please try again.',
  },
  segment: {
    icon: Users,
    typeLabel: 'Segment',
    description: 'Deletes this segment. Cannot be undone.',
    successTitle: 'Segment deleted',
    successDescription: 'The segment has been permanently deleted.',
    errorDescription: 'Failed to delete the segment. Please try again.',
  },
  form: {
    icon: FileText,
    typeLabel: 'Form',
    description: 'Deletes this form. Cannot be undone.',
    successTitle: 'Form deleted',
    successDescription: 'The form has been permanently deleted.',
    errorDescription: 'Failed to delete the form. Please try again.',
  },
  workflow: {
    icon: Zap,
    typeLabel: 'Workflow',
    description: 'Deletes this workflow and stops future runs. Cannot be undone.',
    successTitle: 'Workflow deleted',
    successDescription: 'The workflow has been permanently deleted.',
    errorDescription: 'Failed to delete the workflow. Please try again.',
  },
  generic: {
    icon: Trash2,
    typeLabel: 'Item',
    description: 'Deletes this item. Cannot be undone.',
    successTitle: 'Item deleted',
    successDescription: 'The item has been permanently deleted.',
    errorDescription: 'Failed to delete the item. Please try again.',
  },
};

export interface DeleteDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Async function to execute on confirm. Return true for success, false for failure */
  onConfirm: () => Promise<boolean | void>;
  
  // Item configuration
  /** Predefined item type for automatic configuration */
  itemType?: PredefinedItemType;
  /** Name/title of the item being deleted (displayed in preview) */
  itemTitle?: string;
  /** Custom icon to display (overrides itemType icon) */
  itemIcon?: React.ReactNode;
  /** Color for the item icon */
  itemColor?: string;
  
  // Custom text overrides
  /** Custom dialog title (overrides itemType default) */
  title?: string;
  /** Custom description text (overrides itemType default) */
  description?: string;
  /** Custom confirm button text */
  confirmText?: string;
  /** Custom cancel button text */
  cancelText?: string;
  
  // Toast configuration
  /** Custom success toast title */
  successTitle?: string;
  /** Custom success toast description */
  successDescription?: string;
  /** Custom error toast description */
  errorDescription?: string;
  /** Whether to show toast notifications (default: true) */
  showToast?: boolean;
  
  // Display options
  /** Whether to show the item preview box (default: true if itemTitle provided) */
  showItemPreview?: boolean;
}

export function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  itemType = 'generic',
  itemTitle,
  itemIcon,
  itemColor,
  title,
  description,
  confirmText,
  cancelText = 'Cancel',
  successTitle,
  successDescription,
  errorDescription,
  showToast = true,
  showItemPreview,
}: DeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const config = ITEM_CONFIGS[itemType];
  const ItemIcon = config.icon;
  
  // Use custom values or fall back to config
  const displayTitle = title || `Delete ${config.typeLabel}`;
  const displayDescription = description || config.description;
  const displayConfirmText = confirmText || `Delete ${config.typeLabel}`;
  const displaySuccessTitle = successTitle || config.successTitle;
  const displaySuccessDescription = successDescription || config.successDescription;
  const displayErrorDescription = errorDescription || config.errorDescription;
  
  // Show item preview if itemTitle is provided (unless explicitly disabled)
  const shouldShowPreview = showItemPreview ?? !!itemTitle;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const result = await onConfirm();
      // Treat undefined/void as success, false as failure
      const success = result !== false;
      
      if (success) {
        if (showToast) {
          toast({
            title: displaySuccessTitle,
            description: displaySuccessDescription,
          });
        }
        onOpenChange(false);
      } else {
        if (showToast) {
          toast({
            title: 'Error',
            description: displayErrorDescription,
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      if (showToast) {
        toast({
          title: 'Error',
          description: displayErrorDescription,
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Prevent closing while loading
    if (!newOpen && isLoading) return;
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-raleway">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {displayTitle}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-raleway">
            {displayDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {shouldShowPreview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium font-raleway">
                {config.typeLabel} to delete
              </label>
              <div className="p-3 bg-muted rounded-md border">
                <p className="font-medium text-sm flex items-center gap-2 font-raleway">
                  {itemIcon || (
                    <ItemIcon 
                      className="h-4 w-4" 
                      style={itemColor ? { color: itemColor } : undefined} 
                    />
                  )}
                  {itemTitle || `Untitled ${config.typeLabel}`}
                </p>
              </div>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel 
            disabled={isLoading}
            className="font-raleway"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-raleway"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" variant="current" className="mr-2" />
                Deleting...
              </>
            ) : (
              displayConfirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteDialog;
