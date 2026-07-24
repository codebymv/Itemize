import { useState, useRef, useCallback, useEffect } from 'react';
import { Vault, VaultItem, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCardTitleEditing } from '@/hooks/useCardTitleEditing';
import { useCardColorManagement } from '@/hooks/useCardColorManagement';
import { useCardCategoryManagement } from '@/hooks/useCardCategoryManagement';
import { 
  updateVault, 
  addVaultItem, 
  updateVaultItem, 
  deleteVaultItem,
  bulkAddVaultItems,
  reorderVaultItems,
  getVault,
  lockVault,
  unlockVault,
} from '@/services/api';

export type VaultSecurityDialogMode =
  | 'unlock'
  | 'set-password'
  | 'change-password'
  | 'remove-password';

const hasCompleteVaultItems = (vault: Vault): boolean => {
  const items = vault.items || [];
  return !vault.is_locked && items.length >= (vault.item_count ?? items.length);
};

interface UseVaultCardLogicProps {
  vault: Vault;
  onUpdate: (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Vault | null>;
  onDelete: (vaultId: number) => Promise<boolean>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<unknown>;
}

export const useVaultCardLogic = ({ 
  vault, 
  onUpdate, 
  onDelete, 
  isCollapsed, 
  onToggleCollapsed, 
  updateCategory,
  addCategory 
}: UseVaultCardLogicProps) => {
  const { toast } = useToast();
  const { token } = useAuth();
  
  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  
  // Category editing state is handled via hook
  
  // Items state
  const [items, setItems] = useState<VaultItem[]>(vault.items || []);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(hasCompleteVaultItems(vault));
  
  // Item editing state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState('');
  const [editingItemValue, setEditingItemValue] = useState('');
  
  // New item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemType, setNewItemType] = useState<'key_value' | 'secure_note'>('key_value');
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  
  // Visibility state for items (which items are showing values)
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  
  // Lock state. A successful password verifies this vault only for this
  // component session; the server remains the authority on every read.
  const [isVaultLocked, setIsVaultLocked] = useState(vault.is_locked);
  const [isUnlockedForSession, setIsUnlockedForSession] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState('');
  const [confirmMasterPasswordInput, setConfirmMasterPasswordInput] = useState('');
  const [securityDialogMode, setSecurityDialogMode] =
    useState<VaultSecurityDialogMode | null>(null);
  
  // Refs
  const newItemLabelRef = useRef<HTMLInputElement>(null);
  
  // Update items when vault items change
  useEffect(() => {
    if (vault.items) {
      setItems(vault.items);
      setItemsLoaded(hasCompleteVaultItems(vault));
      if (vault.is_locked) setIsUnlockedForSession(false);
    }
  }, [vault.items, vault.item_count, vault.is_locked]);

  useEffect(() => {
    setIsVaultLocked(vault.is_locked);
    if (!vault.is_locked) setIsUnlockedForSession(false);
  }, [vault.is_locked]);

  const closeSecurityDialog = useCallback(() => {
    if (isUnlocking) return;
    setSecurityDialogMode(null);
    setMasterPasswordInput('');
    setNewMasterPasswordInput('');
    setConfirmMasterPasswordInput('');
  }, [isUnlocking]);

  const openSecurityDialog = useCallback((mode: VaultSecurityDialogMode) => {
    setMasterPasswordInput('');
    setNewMasterPasswordInput('');
    setConfirmMasterPasswordInput('');
    setSecurityDialogMode(mode);
  }, []);
  
  // Load items if not loaded
  const loadItems = useCallback(async (masterPassword?: string) => {
    if (isVaultLocked && !isUnlockedForSession && !masterPassword) {
      openSecurityDialog('unlock');
      return;
    }
    if (itemsLoaded || isLoadingItems) return;

    setIsLoadingItems(true);
    try {
      const fullVault = await getVault(
        vault.id,
        masterPassword,
        token || undefined,
      );
      if (fullVault.items) {
        setItems(fullVault.items);
        setItemsLoaded(true);
        if (isVaultLocked) setIsUnlockedForSession(true);
      }
    } catch (error) {
      console.error('Failed to load vault items:', error);
      toast({
        title: "Error",
        description: "Could not load vault items. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingItems(false);
    }
  }, [
    vault.id,
    token,
    itemsLoaded,
    isLoadingItems,
    isVaultLocked,
    isUnlockedForSession,
    openSecurityDialog,
    toast,
  ]);

  const handleSecuritySubmit = useCallback(async () => {
    if (!securityDialogMode) return;
    if (
      securityDialogMode !== 'set-password' &&
      !masterPasswordInput
    ) {
      toast({
        title: 'Password required',
        description: 'Enter the vault master password.',
        variant: 'destructive',
      });
      return;
    }
    if (
      securityDialogMode === 'set-password' ||
      securityDialogMode === 'change-password'
    ) {
      if (newMasterPasswordInput.length < 8) {
        toast({
          title: 'Password too short',
          description: 'Use at least 8 characters.',
          variant: 'destructive',
        });
        return;
      }
      if (newMasterPasswordInput !== confirmMasterPasswordInput) {
        toast({
          title: 'Passwords do not match',
          description: 'Re-enter the new password.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsUnlocking(true);
    try {
      if (securityDialogMode === 'unlock') {
        const fullVault = await getVault(
          vault.id,
          masterPasswordInput,
          token || undefined,
        );
        setItems(fullVault.items || []);
        setItemsLoaded(true);
        setIsUnlockedForSession(true);
        toast({ title: 'Vault opened' });
      } else if (securityDialogMode === 'remove-password') {
        await unlockVault(
          vault.id,
          masterPasswordInput,
          token || undefined,
        );
        setIsVaultLocked(false);
        setIsUnlockedForSession(false);
        setItemsLoaded(false);
        toast({ title: 'Password removed' });
      } else {
        await lockVault(
          vault.id,
          newMasterPasswordInput,
          securityDialogMode === 'change-password'
            ? masterPasswordInput
            : undefined,
          token || undefined,
        );
        setIsVaultLocked(true);
        setIsUnlockedForSession(false);
        setItems([]);
        setItemsLoaded(false);
        setVisibleItems(new Set());
        toast({
          title:
            securityDialogMode === 'change-password'
              ? 'Password changed'
              : 'Vault protected',
        });
      }
      setSecurityDialogMode(null);
      setMasterPasswordInput('');
      setNewMasterPasswordInput('');
      setConfirmMasterPasswordInput('');
    } catch (error) {
      console.error('Failed to update vault password:', error);
      toast({
        title: 'Password rejected',
        description: 'Check the password and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUnlocking(false);
    }
  }, [
    securityDialogMode,
    masterPasswordInput,
    newMasterPasswordInput,
    confirmMasterPasswordInput,
    toast,
    vault.id,
    token,
  ]);
  
  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  } = useCardTitleEditing({
    title: vault.title || 'Untitled Vault',
    compareTitle: vault.title,
    onSave: async (nextTitle) => {
      if (nextTitle !== vault.title) {
        try {
          await onUpdate(vault.id, { title: nextTitle });
        } catch (error) {
          console.error('Failed to update vault title:', error);
          toast({
            title: "Error",
            description: "Could not update vault title. Please try again.",
            variant: "destructive"
          });
        }
      }
    }
  });
  
  // Vault operations
  const handleDeleteVault = useCallback(async () => {
    return await onDelete(vault.id);
  }, [vault.id, onDelete]);
  
  const { isSavingColor, saveColor: handleSaveVaultColor } = useCardColorManagement({
    onSave: async (newColor) => {
      await onUpdate(vault.id, { color_value: newColor });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update vault color",
        variant: "destructive"
      });
    }
  });
  
  const {
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor
  } = useCardCategoryManagement({
    onUpdateCategory: async (category) => {
      await onUpdate(vault.id, { category });
    },
    onAddCustomCategory: async (category) => {
      await onUpdate(vault.id, { category });
    },
    onUpdateCategoryColor: (categoryName, newColor) => {
      if (!updateCategory) return;
      return updateCategory(categoryName, { color_value: newColor });
    },
    onEmptyCategory: () => {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    },
    onError: (error, action) => {
      console.error('Failed to update vault category:', error);
      if (action === 'color') {
        toast({
          title: 'Error',
          description: 'Could not update category color.',
          variant: 'destructive'
        });
        return;
      }
      toast({
        title: "Error",
        description: action === 'add'
          ? "Could not add custom category. Please try again."
          : "Could not update vault category. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // Item visibility toggle
  const toggleItemVisibility = useCallback((itemId: number) => {
    setVisibleItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);
  
  const isItemVisible = useCallback((itemId: number) => {
    return visibleItems.has(itemId);
  }, [visibleItems]);
  
  // Copy to clipboard
  const copyToClipboard = useCallback(async (value: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Copied!",
        description: label ? `${label} copied to clipboard` : "Value copied to clipboard",
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  }, [toast]);
  
  // Item CRUD operations
  const handleAddItem = useCallback(async () => {
    if (!newItemLabel.trim()) {
      toast({
        title: "Label required",
        description: "Please enter a label for the item",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const newItem = await addVaultItem(vault.id, {
        item_type: newItemType,
        label: newItemLabel.trim(),
        value: newItemValue
      }, token || undefined);
      
      setItems(prev => [...prev, newItem]);
      setShowAddItem(false);
      setNewItemLabel('');
      setNewItemValue('');
      setNewItemType('key_value');
      
      toast({
        title: "Item added",
        description: "New item added to vault",
      });
    } catch (error) {
      console.error('Failed to add vault item:', error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive"
      });
    }
  }, [vault.id, newItemType, newItemLabel, newItemValue, token, toast]);
  
  const handleUpdateItem = useCallback(async (itemId: number) => {
    try {
      const updatedItem = await updateVaultItem(
        vault.id, 
        itemId, 
        { 
          label: editingItemLabel.trim() || undefined,
          value: editingItemValue || undefined 
        },
        token || undefined
      );
      
      setItems(prev => prev.map(item => 
        item.id === itemId ? updatedItem : item
      ));
      setEditingItemId(null);
      setEditingItemLabel('');
      setEditingItemValue('');
    } catch (error) {
      console.error('Failed to update vault item:', error);
      toast({
        title: "Error",
        description: "Could not update item. Please try again.",
        variant: "destructive"
      });
    }
  }, [vault.id, editingItemLabel, editingItemValue, token, toast]);
  
  const handleDeleteItem = useCallback(async (itemId: number) => {
    try {
      await deleteVaultItem(vault.id, itemId, token || undefined);
      setItems(prev => prev.filter(item => item.id !== itemId));
      toast({
        title: "Item deleted",
        description: "Item removed from vault",
      });
    } catch (error) {
      console.error('Failed to delete vault item:', error);
      toast({
        title: "Error",
        description: "Could not delete item. Please try again.",
        variant: "destructive"
      });
    }
  }, [vault.id, token, toast]);
  
  const startEditingItem = useCallback((item: VaultItem) => {
    setEditingItemId(item.id);
    setEditingItemLabel(item.label);
    setEditingItemValue(item.value);
  }, []);
  
  const cancelEditingItem = useCallback(() => {
    setEditingItemId(null);
    setEditingItemLabel('');
    setEditingItemValue('');
  }, []);
  
  // Bulk add items (for .env import)
  const handleBulkAddItems = useCallback(async (itemsToAdd: Array<{ item_type: 'key_value' | 'secure_note'; label: string; value: string }>) => {
    try {
      const result = await bulkAddVaultItems(vault.id, itemsToAdd, token || undefined);
      setItems(prev => [...prev, ...result.items]);
      toast({
        title: "Items imported",
        description: `${result.count} items added to vault`,
      });
      return result.items;
    } catch (error) {
      console.error('Failed to bulk add vault items:', error);
      toast({
        title: "Error",
        description: "Failed to import items",
        variant: "destructive"
      });
      return [];
    }
  }, [vault.id, token, toast]);
  
  // Reorder items
  const handleReorderItems = useCallback(async (newItemIds: number[]) => {
    const oldItems = [...items];
    
    // Optimistic update
    const reorderedItems = newItemIds.map((id, index) => {
      const item = items.find(i => i.id === id);
      return item ? { ...item, order_index: index } : null;
    }).filter(Boolean) as VaultItem[];
    setItems(reorderedItems);
    
    try {
      await reorderVaultItems(vault.id, newItemIds, token || undefined);
    } catch (error) {
      console.error('Failed to reorder vault items:', error);
      // Rollback on error
      setItems(oldItems);
      toast({
        title: "Error",
        description: "Could not reorder items. Please try again.",
        variant: "destructive"
      });
    }
  }, [vault.id, items, token, toast]);
  
  // Parse .env format text
  const parseEnvFormat = useCallback((text: string): Array<{ item_type: 'key_value'; label: string; value: string }> => {
    return text.split('\n')
      .filter(line => line.trim() && !line.trim().startsWith('#'))
      .map(line => {
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) return null;
        
        const key = line.substring(0, equalIndex).trim();
        let value = line.substring(equalIndex + 1).trim();
        
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        if (!key) return null;
        
        return {
          item_type: 'key_value' as const,
          label: key,
          value: value
        };
      })
      .filter(Boolean) as Array<{ item_type: 'key_value'; label: string; value: string }>;
  }, []);
  
  return {
    // Title for display
    vaultTitle: vault.title || 'Untitled Vault',
    
    // Collapsible
    isCollapsibleOpen,
    setIsCollapsibleOpen,
    
    // Title editing
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    
    // Vault operations
    handleDeleteVault,
    
    // Color
    handleSaveVaultColor,
    isSavingColor,
    
    // Category editing
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor,
    
    // Items
    items,
    isLoadingItems,
    itemsLoaded,
    loadItems,
    
    // Item visibility
    toggleItemVisibility,
    isItemVisible,
    copyToClipboard,
    
    // Item editing
    editingItemId,
    editingItemLabel,
    setEditingItemLabel,
    editingItemValue,
    setEditingItemValue,
    startEditingItem,
    cancelEditingItem,
    handleUpdateItem,
    handleDeleteItem,
    
    // New item
    showAddItem,
    setShowAddItem,
    newItemType,
    setNewItemType,
    newItemLabel,
    setNewItemLabel,
    newItemValue,
    setNewItemValue,
    handleAddItem,
    
    // Bulk operations
    handleBulkAddItems,
    handleReorderItems,
    parseEnvFormat,
    
    // Lock state
    isVaultLocked,
    isUnlockedForSession,
    isUnlocking,
    masterPasswordInput,
    setMasterPasswordInput,
    newMasterPasswordInput,
    setNewMasterPasswordInput,
    confirmMasterPasswordInput,
    setConfirmMasterPasswordInput,
    securityDialogMode,
    openSecurityDialog,
    closeSecurityDialog,
    handleSecuritySubmit,
    
    // Refs
    titleEditRef,
    newItemLabelRef,
  };
};
