import { useState, useRef, useCallback, useEffect } from 'react';
import { Vault, VaultItem, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  updateVault, 
  addVaultItem, 
  updateVaultItem, 
  deleteVaultItem,
  bulkAddVaultItems,
  reorderVaultItems,
  getVault
} from '@/services/api';

interface UseVaultCardLogicProps {
  vault: Vault;
  onUpdate: (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Vault | null>;
  onDelete: (vaultId: number) => Promise<boolean>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
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
  
  // Title editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(vault.title || 'Untitled Vault');
  
  // Color state
  const [isSavingColor, setIsSavingColor] = useState(false);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Items state
  const [items, setItems] = useState<VaultItem[]>(vault.items || []);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(!!vault.items);
  
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
  
  // Lock state
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  
  // Refs
  const titleEditRef = useRef<HTMLInputElement>(null);
  const newItemLabelRef = useRef<HTMLInputElement>(null);
  
  // Update title state when vault title changes
  useEffect(() => {
    setEditTitle(vault.title || 'Untitled Vault');
  }, [vault.title]);
  
  // Update items when vault items change
  useEffect(() => {
    if (vault.items) {
      setItems(vault.items);
      setItemsLoaded(true);
    }
  }, [vault.items]);
  
  // Load items if not loaded
  const loadItems = useCallback(async () => {
    if (itemsLoaded || isLoadingItems) return;
    
    setIsLoadingItems(true);
    try {
      const fullVault = await getVault(vault.id, undefined, token || undefined);
      if (fullVault.items) {
        setItems(fullVault.items);
        setItemsLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load vault items:', error);
      toast({
        title: "Error loading items",
        description: "Could not load vault items. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingItems(false);
    }
  }, [vault.id, token, itemsLoaded, isLoadingItems, toast]);
  
  // Title editing handlers
  const handleEditTitle = useCallback(async () => {
    if (editTitle.trim() !== vault.title) {
      try {
        await onUpdate(vault.id, { title: editTitle.trim() });
      } catch (error) {
        console.error('Failed to update vault title:', error);
        toast({
          title: "Error updating title",
          description: "Could not update vault title. Please try again.",
          variant: "destructive"
        });
      }
    }
    setIsEditing(false);
  }, [editTitle, vault.title, vault.id, onUpdate, toast]);
  
  // Vault operations
  const handleDeleteVault = useCallback(async () => {
    return await onDelete(vault.id);
  }, [vault.id, onDelete]);
  
  // Color operations
  const handleSaveVaultColor = useCallback(async (newColor: string) => {
    setIsSavingColor(true);
    try {
      await onUpdate(vault.id, { color_value: newColor });
    } catch (error) {
      console.error('Failed to save vault color:', error);
      toast({
        title: "Error updating color",
        description: "Could not update vault color. Please try again.",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsSavingColor(false);
    }
  }, [vault.id, onUpdate, toast]);
  
  // Category operations
  const handleEditCategory = useCallback(async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    try {
      await onUpdate(vault.id, { category });
      setIsEditingCategory(false);
      setShowNewCategoryInput(false);
    } catch (error) {
      console.error('Failed to update vault category:', error);
      toast({
        title: "Error updating category",
        description: "Could not update vault category. Please try again.",
        variant: "destructive"
      });
    }
  }, [vault.id, onUpdate, toast]);
  
  const handleAddCustomCategory = useCallback(async () => {
    if (newCategory.trim() !== '') {
      try {
        await onUpdate(vault.id, { category: newCategory.trim() });
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
        setNewCategory('');
      } catch (error) {
        console.error('Failed to add custom category:', error);
        toast({
          title: "Error adding category",
          description: "Could not add custom category. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    }
  }, [newCategory, vault.id, onUpdate, toast]);

  const handleUpdateCategoryColor = useCallback(async (categoryName: string, newColor: string) => {
    if (!updateCategory) return;
    try {
      await updateCategory(categoryName, { color_value: newColor });
    } catch (error) {
      console.error('Failed to update category color:', error);
      toast({
        title: 'Error',
        description: 'Could not update category color.',
        variant: 'destructive'
      });
    }
  }, [updateCategory, toast]);
  
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
        title: "Error adding item",
        description: "Could not add item. Please try again.",
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
        title: "Error updating item",
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
        title: "Error deleting item",
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
        title: "Error importing items",
        description: "Could not import items. Please try again.",
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
        title: "Error reordering items",
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
    isUnlocking,
    setIsUnlocking,
    masterPasswordInput,
    setMasterPasswordInput,
    
    // Refs
    titleEditRef,
    newItemLabelRef,
  };
};
