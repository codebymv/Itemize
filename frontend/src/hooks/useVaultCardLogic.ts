import { useState, useRef, useCallback, useEffect } from "react";
import { Vault, VaultItem, Category } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCardTitleEditing } from "@/hooks/useCardTitleEditing";
import { useCardColorManagement } from "@/hooks/useCardColorManagement";
import { useCardCategoryManagement } from "@/hooks/useCardCategoryManagement";
import {
  updateVault,
  addVaultItem,
  updateVaultItem,
  deleteVaultItem,
  bulkAddVaultItems,
  reorderVaultItems,
  getVault,
  unlockVault,
} from "@/services/api";
import {
  encryptZkeItem,
  enrollVaultToV2,
  isVaultZke,
  lockZkeSession,
  rewrapZkeVault,
  unlockZkeVault,
} from "@/lib/vaultZkSession";
import { useSingleFlightAction } from "@/hooks/useSingleFlightAction";

export type VaultSecurityDialogMode =
  "unlock" | "set-password" | "change-password" | "remove-password";

const AUTO_LOCK_MS = 5 * 60 * 1000;
const CLIPBOARD_CLEAR_MS = 30_000;

const hasCompleteVaultItems = (vault: Vault): boolean => {
  if (isVaultZke(vault)) return false;
  const items = vault.items || [];
  return !vault.is_locked && items.length >= (vault.item_count ?? items.length);
};

interface UseVaultCardLogicProps {
  vault: Vault;
  onUpdate: (
    vaultId: number,
    updatedData: Partial<
      Omit<Vault, "id" | "user_id" | "created_at" | "updated_at">
    >,
  ) => Promise<Vault | null>;
  onDelete: (vaultId: number) => Promise<boolean>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (
    categoryName: string,
    updatedData: Partial<Category>,
  ) => Promise<void>;
  addCategory?: (categoryData: {
    name: string;
    color_value: string;
  }) => Promise<unknown>;
}

export const useVaultCardLogic = ({
  vault,
  onUpdate,
  onDelete,
  isCollapsed,
  onToggleCollapsed,
  updateCategory,
  addCategory,
}: UseVaultCardLogicProps) => {
  const { toast } = useToast();
  const { token } = useAuth();
  const { pending: bulkImportPending, run: runBulkImport } = useSingleFlightAction();

  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);

  const isCollapsibleOpen =
    isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;

  // Category editing state is handled via hook

  // Items state
  const [items, setItems] = useState<VaultItem[]>(vault.items || []);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsLoadError, setItemsLoadError] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(
    vault.client_session_unlocked || hasCompleteVaultItems(vault),
  );

  // Item editing state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState("");
  const [editingItemValue, setEditingItemValue] = useState("");

  // New item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemType, setNewItemType] = useState<"key_value" | "secure_note">(
    "key_value",
  );
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemValue, setNewItemValue] = useState("");

  // Visibility state for items (which items are showing values)
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());

  // Lock state. A successful password verifies this vault only for this
  // component session; the server remains the authority on every read.
  const [isVaultLocked, setIsVaultLocked] = useState(vault.is_locked);
  const [isUnlockedForSession, setIsUnlockedForSession] = useState(
    Boolean(vault.client_session_unlocked),
  );
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState("");
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState("");
  const [confirmMasterPasswordInput, setConfirmMasterPasswordInput] =
    useState("");
  const [securityDialogMode, setSecurityDialogMode] =
    useState<VaultSecurityDialogMode | null>(null);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [needsEnrollment, setNeedsEnrollment] = useState(
    !isVaultZke(vault) && !vault.is_locked,
  );
  const [cryptoVersion, setCryptoVersion] = useState(vault.crypto_version ?? 1);
  const isZke = cryptoVersion >= 2;

  // Refs
  const newItemLabelRef = useRef<HTMLInputElement>(null);
  const sessionPasswordRef = useRef<string | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const clipboardClearTimerRef = useRef<number | null>(null);

  // Update items when vault items change
  useEffect(() => {
    if (vault.items) {
      setItems(vault.items);
      const hasCompleteItems =
        (vault.crypto_version ?? 1) < 2 &&
        !vault.is_locked &&
        vault.items.length >= (vault.item_count ?? vault.items.length);
      setItemsLoaded(
        Boolean(vault.client_session_unlocked) || hasCompleteItems,
      );
      if (vault.is_locked && !vault.client_session_unlocked) {
        setIsUnlockedForSession(false);
      }
    }
  }, [
    vault.client_session_unlocked,
    vault.crypto_version,
    vault.items,
    vault.item_count,
    vault.is_locked,
  ]);

  useEffect(() => {
    setIsVaultLocked(vault.is_locked);
    setCryptoVersion(vault.crypto_version ?? 1);
    setNeedsEnrollment(!isZke && !vault.is_locked);
    if (!vault.is_locked && !isZke) setIsUnlockedForSession(false);
  }, [vault.is_locked, vault.crypto_version]);

  const closeSecurityDialog = useCallback(() => {
    if (isUnlocking) return;
    setSecurityDialogMode(null);
    setMasterPasswordInput("");
    setNewMasterPasswordInput("");
    setConfirmMasterPasswordInput("");
  }, [isUnlocking]);

  const openSecurityDialog = useCallback((mode: VaultSecurityDialogMode) => {
    setMasterPasswordInput("");
    setNewMasterPasswordInput("");
    setConfirmMasterPasswordInput("");
    setSecurityDialogMode(mode);
  }, []);

  const lockSession = useCallback(() => {
    sessionPasswordRef.current = null;
    setIsUnlockedForSession(false);
    setVisibleItems(new Set());
    void lockZkeSession(vault.id);
    if (vault.is_locked || isZke) {
      setItems([]);
      setItemsLoaded(false);
    }
  }, [vault.id, vault.is_locked, vault.crypto_version]);

  const bumpIdleTimer = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (!sessionPasswordRef.current) return;
    idleTimerRef.current = window.setTimeout(lockSession, AUTO_LOCK_MS);
  }, [lockSession]);

  useEffect(() => {
    if (!isUnlockedForSession) return;
    bumpIdleTimer();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") lockSession();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [isUnlockedForSession, bumpIdleTimer, lockSession]);

  useEffect(() => {
    if (!isCollapsibleOpen) lockSession();
  }, [isCollapsibleOpen, lockSession]);

  useEffect(
    () => () => {
      sessionPasswordRef.current = null;
      if (clipboardClearTimerRef.current)
        window.clearTimeout(clipboardClearTimerRef.current);
    },
    [],
  );

  // Load items if not loaded
  const loadItems = useCallback(
    async (masterPassword?: string) => {
      if (needsEnrollment && !isZke) {
        openSecurityDialog("set-password");
        return;
      }
      if (
        (isVaultLocked || isZke) &&
        !isUnlockedForSession &&
        !masterPassword
      ) {
        openSecurityDialog("unlock");
        return;
      }
      if (itemsLoaded || isLoadingItems) return;

      setIsLoadingItems(true);
      setItemsLoadError(false);
      try {
        const fullVault = await getVault(
          vault.id,
          isZke ? undefined : masterPassword,
          token || undefined,
        );
        if (isVaultZke(fullVault) || isZke) {
          const decrypted = await unlockZkeVault(
            fullVault,
            masterPassword || sessionPasswordRef.current || "",
          );
          setItems(decrypted);
          setItemsLoaded(true);
          if (masterPassword) sessionPasswordRef.current = masterPassword;
          setIsUnlockedForSession(true);
          return;
        }
        if (fullVault.items) {
          setItems(fullVault.items);
          setItemsLoaded(true);
          if (isVaultLocked && masterPassword) {
            sessionPasswordRef.current = masterPassword;
            setIsUnlockedForSession(true);
          }
        }
      } catch (error) {
        console.error("Failed to load vault items:", error);
        setItemsLoadError(true);
      } finally {
        setIsLoadingItems(false);
      }
    },
    [
      vault.id,
      vault.crypto_version,
      token,
      itemsLoaded,
      isLoadingItems,
      isVaultLocked,
      isUnlockedForSession,
      needsEnrollment,
      openSecurityDialog,
    ],
  );

  const handleSecuritySubmit = useCallback(async () => {
    if (!securityDialogMode) return;
    if (securityDialogMode !== "set-password" && !masterPasswordInput) {
      toast({
        title: "Password required",
        description: "Enter the vault master password.",
        variant: "destructive",
      });
      return;
    }
    if (
      securityDialogMode === "set-password" ||
      securityDialogMode === "change-password"
    ) {
      if (newMasterPasswordInput.length < 8) {
        toast({
          title: "Password too short",
          description: "Use at least 8 characters.",
          variant: "destructive",
        });
        return;
      }
      if (newMasterPasswordInput !== confirmMasterPasswordInput) {
        toast({
          title: "Passwords do not match",
          description: "Re-enter the new password.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsUnlocking(true);
    try {
      if (securityDialogMode === "unlock") {
        const fullVault = await getVault(
          vault.id,
          isZke ? undefined : masterPasswordInput,
          token || undefined,
        );
        if (isVaultZke(fullVault) || isZke) {
          const decrypted = await unlockZkeVault(
            fullVault,
            masterPasswordInput,
          );
          setItems(decrypted);
        } else {
          setItems(fullVault.items || []);
          const migrated = await enrollVaultToV2(
            fullVault,
            masterPasswordInput,
            fullVault.items || [],
            masterPasswordInput,
          );
          setRecoveryKit(migrated.recoverySecret);
          setNeedsEnrollment(false);
          setCryptoVersion(2);
        }
        setItemsLoaded(true);
        sessionPasswordRef.current = masterPasswordInput;
        setIsUnlockedForSession(true);
        bumpIdleTimer();
        toast({
          title: "Vault opened",
          description: "Locks after 5 minutes idle, or when you leave the tab.",
        });
      } else if (securityDialogMode === "remove-password") {
        if (isZke) {
          toast({
            title: "Password required",
            description:
              "Zero-knowledge vaults cannot remove the vault password.",
            variant: "destructive",
          });
          return;
        }
        await unlockVault(vault.id, masterPasswordInput, token || undefined);
        setIsVaultLocked(false);
        sessionPasswordRef.current = null;
        setIsUnlockedForSession(false);
        setItemsLoaded(false);
        setNeedsEnrollment(true);
        toast({ title: "Password removed" });
      } else if (isZke && securityDialogMode === "change-password") {
        const recoverySecret = await rewrapZkeVault(
          vault,
          newMasterPasswordInput,
        );
        sessionPasswordRef.current = newMasterPasswordInput;
        setRecoveryKit(recoverySecret);
        toast({ title: "Password changed" });
      } else {
        const currentItems = itemsLoaded
          ? items
          : (
              await getVault(
                vault.id,
                vault.is_locked ? masterPasswordInput : undefined,
                token || undefined,
              )
            ).items || [];
        const migrated = await enrollVaultToV2(
          vault,
          newMasterPasswordInput,
          currentItems,
          vault.is_locked ? masterPasswordInput : undefined,
        );
        setItems(currentItems);
        setItemsLoaded(true);
        setIsVaultLocked(true);
        setNeedsEnrollment(false);
        setCryptoVersion(2);
        sessionPasswordRef.current = newMasterPasswordInput;
        setIsUnlockedForSession(true);
        setRecoveryKit(migrated.recoverySecret);
        toast({
          title:
            securityDialogMode === "change-password"
              ? "Password changed"
              : "Vault protected",
        });
      }
      setSecurityDialogMode(null);
      setMasterPasswordInput("");
      setNewMasterPasswordInput("");
      setConfirmMasterPasswordInput("");
    } catch (error) {
      console.error("Failed to update vault password:", error);
      toast({
        title: "Password rejected",
        description: "Check the password and try again.",
        variant: "destructive",
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
    vault,
    items,
    itemsLoaded,
    token,
    bumpIdleTimer,
  ]);

  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef,
  } = useCardTitleEditing({
    title: vault.title || "Untitled Vault",
    compareTitle: vault.title,
    onSave: async (nextTitle) => {
      if (nextTitle !== vault.title) {
        try {
          await onUpdate(vault.id, { title: nextTitle });
        } catch (error) {
          console.error("Failed to update vault title:", error);
          toast({
            title: "Error",
            description: "Could not update vault title. Please try again.",
            variant: "destructive",
          });
        }
      }
    },
  });

  // Vault operations
  const handleDeleteVault = useCallback(async () => {
    return await onDelete(vault.id);
  }, [vault.id, onDelete]);

  const { isSavingColor, saveColor: handleSaveVaultColor } =
    useCardColorManagement({
      onSave: async (newColor) => {
        await onUpdate(vault.id, { color_value: newColor });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update vault color",
          variant: "destructive",
        });
      },
    });

  const {
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    isSavingCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor,
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
        variant: "destructive",
      });
    },
    onError: (error, action) => {
      console.error("Failed to update vault category:", error);
      if (action === "color") {
        toast({
          title: "Error",
          description: "Could not update category color.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description:
          action === "add"
            ? "Could not add custom category. Please try again."
            : "Could not update vault category. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Item visibility toggle
  const toggleItemVisibility = useCallback((itemId: number) => {
    setVisibleItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const isItemVisible = useCallback(
    (itemId: number) => {
      return visibleItems.has(itemId);
    },
    [visibleItems],
  );

  // Copy to clipboard
  const sessionWritePassword = useCallback(() => {
    bumpIdleTimer();
    if ((isVaultLocked || isZke || needsEnrollment) && !isUnlockedForSession) {
      openSecurityDialog(needsEnrollment ? "set-password" : "unlock");
      return null;
    }
    return isZke ? undefined : sessionPasswordRef.current || undefined;
  }, [
    bumpIdleTimer,
    isVaultLocked,
    isUnlockedForSession,
    needsEnrollment,
    openSecurityDialog,
    vault.crypto_version,
  ]);

  const copyToClipboard = useCallback(
    async (value: string, label?: string) => {
      try {
        await navigator.clipboard.writeText(value);
        if (clipboardClearTimerRef.current) {
          window.clearTimeout(clipboardClearTimerRef.current);
        }
        clipboardClearTimerRef.current = window.setTimeout(() => {
          void navigator.clipboard.writeText("").catch(() => undefined);
        }, CLIPBOARD_CLEAR_MS);
        bumpIdleTimer();
        toast({
          title: "Copied",
          description: label
            ? `${label} copied. Clipboard clears in 30 seconds.`
            : "Copied. Clipboard clears in 30 seconds.",
        });
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        toast({
          title: "Copy failed",
          description: "Could not copy to clipboard",
          variant: "destructive",
        });
      }
    },
    [bumpIdleTimer, toast],
  );

  // Item CRUD operations
  const handleAddItem = useCallback(async () => {
    if (!newItemLabel.trim()) {
      toast({
        title: "Label required",
        description: "Please enter a label for the item",
        variant: "destructive",
      });
      return;
    }

    try {
      const masterPassword = sessionWritePassword();
      if ((isVaultLocked || isZke || needsEnrollment) && !isUnlockedForSession)
        return;
      const payload = isZke
        ? {
            item_type: newItemType,
            label: newItemLabel.trim(),
            value: newItemValue,
            ...(await encryptZkeItem(vault.id, {
              item_type: newItemType,
              label: newItemLabel.trim(),
              value: newItemValue,
            })),
          }
        : {
            item_type: newItemType,
            label: newItemLabel.trim(),
            value: newItemValue,
          };
      const newItem = await addVaultItem(
        vault.id,
        payload,
        token || undefined,
        masterPassword,
      );
      setItems((prev) => [
        ...prev,
        {
          ...newItem,
          label: newItemLabel.trim(),
          value: newItemValue,
        },
      ]);
      setShowAddItem(false);
      setNewItemLabel("");
      setNewItemValue("");
      setNewItemType("key_value");

      toast({
        title: "Item added",
        description: "New item added to vault",
      });
    } catch (error) {
      console.error("Failed to add vault item:", error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    }
  }, [
    vault.id,
    newItemType,
    newItemLabel,
    newItemValue,
    token,
    toast,
    isVaultLocked,
    sessionWritePassword,
  ]);

  const handleUpdateItem = useCallback(
    async (itemId: number) => {
      try {
        const masterPassword = sessionWritePassword();
        if (
          (isVaultLocked || isZke || needsEnrollment) &&
          !isUnlockedForSession
        )
          return;
        const payload = isZke
          ? {
              ...(await encryptZkeItem(vault.id, {
                item_type:
                  items.find((item) => item.id === itemId)?.item_type ??
                  "key_value",
                label: editingItemLabel.trim(),
                value: editingItemValue,
              })),
            }
          : {
              label: editingItemLabel.trim() || undefined,
              value: editingItemValue || undefined,
            };
        const updatedItem = await updateVaultItem(
          vault.id,
          itemId,
          payload,
          token || undefined,
          masterPassword,
        );

        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...updatedItem,
                  label: editingItemLabel.trim(),
                  value: editingItemValue,
                }
              : item,
          ),
        );
        setEditingItemId(null);
        setEditingItemLabel("");
        setEditingItemValue("");
      } catch (error) {
        console.error("Failed to update vault item:", error);
        toast({
          title: "Error",
          description: "Could not update item. Please try again.",
          variant: "destructive",
        });
      }
    },
    [
      vault.id,
      editingItemLabel,
      editingItemValue,
      token,
      toast,
      isVaultLocked,
      sessionWritePassword,
    ],
  );

  const handleDeleteItem = useCallback(
    async (itemId: number) => {
      try {
        const masterPassword = sessionWritePassword();
        if (
          (isVaultLocked || isZke || needsEnrollment) &&
          !isUnlockedForSession
        )
          return;
        await deleteVaultItem(
          vault.id,
          itemId,
          token || undefined,
          masterPassword,
        );
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        toast({
          title: "Item deleted",
          description: "Item removed from vault",
        });
      } catch (error) {
        console.error("Failed to delete vault item:", error);
        toast({
          title: "Error",
          description: "Could not delete item. Please try again.",
          variant: "destructive",
        });
      }
    },
    [vault.id, token, toast, isVaultLocked, sessionWritePassword],
  );

  const startEditingItem = useCallback((item: VaultItem) => {
    setEditingItemId(item.id);
    setEditingItemLabel(item.label);
    setEditingItemValue(item.value);
  }, []);

  const cancelEditingItem = useCallback(() => {
    setEditingItemId(null);
    setEditingItemLabel("");
    setEditingItemValue("");
  }, []);

  // Bulk add items (for .env import)
  const handleBulkAddItems = useCallback(
    async (
      itemsToAdd: Array<{
        item_type: "key_value" | "secure_note";
        label: string;
        value: string;
      }>,
    ) => {
      const result = await runBulkImport(async () => {
        try {
          const masterPassword = sessionWritePassword();
          if (
            (isVaultLocked || isZke || needsEnrollment) &&
            !isUnlockedForSession
          )
            return [];
          const payloads = isZke
            ? await Promise.all(
                itemsToAdd.map(async (item) => ({
                  ...item,
                  ...(await encryptZkeItem(vault.id, item)),
                })),
              )
            : itemsToAdd;
          const response = await bulkAddVaultItems(
            vault.id,
            payloads,
            token || undefined,
            masterPassword,
          );
          const merged = response.items.map((item, index) => ({
            ...item,
            label: itemsToAdd[index].label,
            value: itemsToAdd[index].value,
          }));
          setItems((prev) => [...prev, ...merged]);
          toast({
            title: "Items imported",
            description: `${response.count} items added to vault`,
          });
          return response.items;
        } catch (error) {
          console.error("Failed to bulk add vault items:", error);
          toast({
            title: "Error",
            description: "Failed to import items",
            variant: "destructive",
          });
          return [];
        }
      });
      return result ?? [];
    },
    [vault.id, token, toast, isVaultLocked, isZke, needsEnrollment, isUnlockedForSession, runBulkImport, sessionWritePassword],
  );

  // Reorder items
  const handleReorderItems = useCallback(
    async (newItemIds: number[]) => {
      const oldItems = [...items];

      // Optimistic update
      const reorderedItems = newItemIds
        .map((id, index) => {
          const item = items.find((i) => i.id === id);
          return item ? { ...item, order_index: index } : null;
        })
        .filter(Boolean) as VaultItem[];
      setItems(reorderedItems);

      try {
        const masterPassword = sessionWritePassword();
        if (
          (isVaultLocked || isZke || needsEnrollment) &&
          !isUnlockedForSession
        ) {
          setItems(oldItems);
          return;
        }
        await reorderVaultItems(
          vault.id,
          newItemIds,
          token || undefined,
          masterPassword,
        );
      } catch (error) {
        console.error("Failed to reorder vault items:", error);
        // Rollback on error
        setItems(oldItems);
        toast({
          title: "Error",
          description: "Could not reorder items. Please try again.",
          variant: "destructive",
        });
      }
    },
    [vault.id, items, token, toast, isVaultLocked, sessionWritePassword],
  );

  // Parse .env format text
  const parseEnvFormat = useCallback(
    (
      text: string,
    ): Array<{ item_type: "key_value"; label: string; value: string }> => {
      return text
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const equalIndex = line.indexOf("=");
          if (equalIndex === -1) return null;

          const key = line.substring(0, equalIndex).trim();
          let value = line.substring(equalIndex + 1).trim();

          // Remove surrounding quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          if (!key) return null;

          return {
            item_type: "key_value" as const,
            label: key,
            value: value,
          };
        })
        .filter(Boolean) as Array<{
        item_type: "key_value";
        label: string;
        value: string;
      }>;
    },
    [],
  );

  return {
    // Title for display
    vaultTitle: vault.title || "Untitled Vault",

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
    isSavingCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor,

    // Items
    items,
    isLoadingItems,
    itemsLoadError,
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
    bulkImportPending,
    handleReorderItems,
    parseEnvFormat,

    // Lock state
    isVaultLocked: isVaultLocked || isZke || needsEnrollment,
    isUnlockedForSession,
    isUnlocking,
    needsEnrollment,
    recoveryKit,
    dismissRecoveryKit: () => setRecoveryKit(null),
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
