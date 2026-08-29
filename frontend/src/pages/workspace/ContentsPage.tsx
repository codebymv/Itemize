import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Search,
  Map,
  CheckSquare,
  StickyNote,
  Palette,
  GitBranch,
  KeyRound,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from "@/contexts/AuthContext";
import {
  createList as apiCreateList,
  createNote as apiCreateNote,
  createWhiteboard as apiCreateWhiteboard,
  createWireframe as apiCreateWireframe,
  createVault as apiCreateVault,
  deleteList as apiDeleteList,
  deleteNote as apiDeleteNote,
  deleteWhiteboard as apiDeleteWhiteboard,
  deleteWireframe as apiDeleteWireframe,
  deleteVault as apiDeleteVault,
  updateList as apiUpdateList,
  updateNote as apiUpdateNote,
  updateWhiteboard as apiUpdateWhiteboard,
  updateWireframe as apiUpdateWireframe,
  updateVault as apiUpdateVault,
  shareList as apiShareList,
  shareNote as apiShareNote,
  shareWhiteboard as apiShareWhiteboard,
  unshareList as apiUnshareList,
  unshareNote as apiUnshareNote,
  unshareWhiteboard as apiUnshareWhiteboard,
  shareVault,
  unshareVault,
} from "@/services/api";
import { List, Note, Whiteboard, Wireframe, Vault, Category } from "@/types";
import { useDatabaseCategories } from "@/hooks/useDatabaseCategories";
import ListCard from "@/components/ListCard/ListCard";
import NoteCard from "@/components/NoteCard/NoteCard";
import WhiteboardCard from "@/components/WhiteboardCard/WhiteboardCard";
import WireframeCard from "@/components/WireframeCard/WireframeCard";
import { VaultCard } from "@/components/VaultCard/VaultCard";
import {
  activatePreparedVaultSession,
  type PreparedVaultSecurity,
} from "@/lib/vaultZkSession";
import type { CreateItemPresetPayload } from "@/config/contentPresets";
import { CreateItemModal } from "@/components/CreateItemModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageLayout } from "@/components/layout/PageLayout";
import {
  HeaderActionLabel,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from "@/components/layout/DesktopHeaderTools";
import { EmptyState } from "@/components/EmptyState";
import { useRouteOnboarding } from "@/hooks/useOnboardingTrigger";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ONBOARDING_CONTENT } from "@/config/onboardingContent";
import { ShareModal } from "@/components/ShareModal";
import { appendShareFragment } from "@/lib/vaultZkCrypto";
import {
  decryptZkeVaultItems,
  encryptVaultShareSnapshot,
  isVaultZke,
} from "@/lib/vaultZkSession";
import {
  enableVaultSharingViaGraphql,
  getVaultViaGraphql,
} from "@/services/workspaceVaultGraphql";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  disableWorkspaceWireframeSharingViaGraphql,
  enableWorkspaceWireframeSharingViaGraphql,
} from "@/services/workspaceWireframeMutationsGraphql";
import { ErrorState } from "@/components/ErrorState";
import { useWorkspaceContent } from "./hooks/useWorkspaceContent";
import { useResponsiveContentCollapse } from "@/hooks/useResponsiveContentCollapse";
import { useQueuedListUpdates } from "@/hooks/useQueuedListUpdates";
import { findOpenCanvasPosition } from "@/lib/canvasPosition";

type ContentType =
  "all" | "list" | "note" | "whiteboard" | "wireframe" | "vault";
type SortOption = "updated" | "created" | "title";
type WorkspaceShareTarget = {
  itemType: "list" | "note" | "whiteboard" | "wireframe";
  itemId: string | number;
  itemTitle: string;
  isPublic?: boolean;
  shareToken?: string;
};

export function ContentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token } = useAuthState();
  const isMobile = useIsMobile();

  const {
    showModal: showOnboarding,
    handleComplete: handleOnboardingComplete,
    handleDismiss: handleOnboardingDismiss,
    handleClose: handleOnboardingClose,
    featureKey: onboardingFeatureKey,
  } = useRouteOnboarding();

  const [typeFilter, setTypeFilter] = useState<ContentType>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");

  const {
    lists,
    notes,
    whiteboards,
    wireframes,
    vaults,
    setLists,
    setNotes,
    setWhiteboards,
    setWireframes,
    setVaults,
    loading,
    refreshing,
    error: contentError,
    refresh: fetchAllContent,
  } = useWorkspaceContent(token);

  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [showNewWhiteboardModal, setShowNewWhiteboardModal] = useState(false);
  const [showNewWireframeModal, setShowNewWireframeModal] = useState(false);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);
  const [workspaceShareTarget, setWorkspaceShareTarget] =
    useState<WorkspaceShareTarget | null>(null);
  const [vaultToShare, setVaultToShare] = useState<Vault | null>(null);

  const {
    categories: dbCategories,
    addCategory,
    editCategory: updateCategoryInDB,
    getCategoryByName,
  } = useDatabaseCategories();

  const editCategory = async (
    categoryName: string,
    updatedData: Partial<{ name: string; color_value: string }>,
  ) => {
    try {
      const existingCategory = getCategoryByName(categoryName);
      if (!existingCategory) {
        throw new Error(`Category "${categoryName}" not found`);
      }

      const updatedCategory = await updateCategoryInDB(existingCategory.id, {
        name: updatedData.name || existingCategory.name,
        color_value: updatedData.color_value || existingCategory.color_value,
      });

      if (!updatedCategory) {
        throw new Error("Failed to update category");
      }

      const nextName = updatedCategory.name || categoryName;
      const nextColor =
        updatedCategory.color_value || existingCategory.color_value;
      setLists((current) =>
        current.map((list) =>
          list.type === categoryName
            ? { ...list, type: nextName, color_value: nextColor }
            : list,
        ),
      );
      setNotes((current) =>
        current.map((note) =>
          (note.category || "General") === categoryName
            ? {
                ...note,
                category: nextName,
                color_value: nextColor || note.color_value,
              }
            : note,
        ),
      );
      setWhiteboards((current) =>
        current.map((whiteboard) =>
          (whiteboard.category || "General") === categoryName
            ? {
                ...whiteboard,
                category: nextName,
                color_value: nextColor || whiteboard.color_value,
              }
            : whiteboard,
        ),
      );
      setWireframes((current) =>
        current.map((wireframe) =>
          (wireframe.category || "General") === categoryName
            ? {
                ...wireframe,
                category: nextName,
                color_value: nextColor || wireframe.color_value,
              }
            : wireframe,
        ),
      );
      setVaults((current) =>
        current.map((vault) =>
          (vault.category || "General") === categoryName
            ? {
                ...vault,
                category: nextName,
                color_value: nextColor || vault.color_value,
              }
            : vault,
        ),
      );
    } catch (error) {
      console.error("Error updating category:", error);
    }
  };

  const contentCollapse = useResponsiveContentCollapse(isMobile);

  const mutateList = useCallback(
    (list: List) => apiUpdateList(list, token),
    [token],
  );

  const handleListUpdateError = useCallback(
    (error: unknown) => {
      console.error("Failed to update list:", error);
      toast({
        title: "Error",
        description: "Failed to update list",
        variant: "destructive",
      });
    },
    [toast],
  );

  const handleListUpdate = useQueuedListUpdates({
    setLists,
    mutate: mutateList,
    onError: handleListUpdateError,
  });

  const handleListDelete = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await apiDeleteList(id, token);
        toast({
          title: "List deleted",
          description: "List removed successfully",
        });
        setLists((current) => current.filter((list) => list.id !== id));
        return true;
      } catch (error) {
        console.error("Failed to delete list:", error);
        toast({
          title: "Error",
          description: "Failed to delete list",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast, setLists],
  );

  const handleListShare = useCallback(
    (id: string) => {
      const list = lists.find((candidate) => candidate.id === id);
      if (list)
        setWorkspaceShareTarget({
          itemType: "list",
          itemId: id,
          itemTitle: list.title || "Untitled List",
          isPublic: list.is_public,
          shareToken: list.share_token,
        });
    },
    [lists],
  );

  const handleNoteUpdate = useCallback(
    async (
      noteId: number,
      updatedData: Partial<Omit<Note, "id" | "user_id" | "created_at">>,
    ) => {
      const previous = notes.find((note) => note.id === noteId);
      setNotes((current) =>
        current.map((note) =>
          note.id === noteId
            ? { ...note, ...updatedData, updated_at: new Date().toISOString() }
            : note,
        ),
      );
      try {
        const updated = await apiUpdateNote(noteId, updatedData, token);
        setNotes((current) =>
          current.map((note) =>
            note.id === noteId ? (updated as Note) : note,
          ),
        );
      } catch (error) {
        console.error("Failed to update note:", error);
        toast({
          title: "Error",
          description: "Failed to update note",
          variant: "destructive",
        });
        if (previous) {
          setNotes((current) =>
            current.map((note) => (note.id === noteId ? previous : note)),
          );
        }
        throw error;
      }
    },
    [notes, token, toast, setNotes],
  );

  const handleNoteDelete = useCallback(
    async (id: number): Promise<void> => {
      try {
        await apiDeleteNote(id, token);
        toast({
          title: "Note deleted",
          description: "Note removed successfully",
        });
        setNotes((current) => current.filter((note) => note.id !== id));
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast({
          title: "Error",
          description: "Failed to delete note",
          variant: "destructive",
        });
      }
    },
    [token, toast, setNotes],
  );

  const handleNoteShare = useCallback(
    (id: number) => {
      const note = notes.find((candidate) => candidate.id === id);
      if (note)
        setWorkspaceShareTarget({
          itemType: "note",
          itemId: id,
          itemTitle: note.title || "Untitled Note",
          isPublic: note.is_public,
          shareToken: note.share_token,
        });
    },
    [notes],
  );

  const handleWhiteboardUpdate = useCallback(
    async (
      whiteboardId: number,
      updatedData: Partial<
        Omit<Whiteboard, "id" | "user_id" | "created_at" | "updated_at">
      >,
    ) => {
      try {
        const result = await apiUpdateWhiteboard(
          whiteboardId,
          updatedData,
          token,
        );
        setWhiteboards((current) =>
          current.map((whiteboard) =>
            whiteboard.id === whiteboardId
              ? (result as Whiteboard)
              : whiteboard,
          ),
        );
        return result as Whiteboard;
      } catch (error) {
        console.error("Failed to update whiteboard:", error);
        toast({
          title: "Error",
          description: "Failed to update whiteboard",
          variant: "destructive",
        });
        throw error;
      }
    },
    [token, toast, setWhiteboards],
  );

  const handleWireframeUpdate = useCallback(
    async (
      wireframeId: number,
      updatedData: Partial<
        Omit<Wireframe, "id" | "user_id" | "created_at" | "updated_at">
      >,
    ) => {
      try {
        const result = await apiUpdateWireframe(
          wireframeId,
          updatedData,
          token,
        );
        setWireframes((current) =>
          current.map((wireframe) =>
            wireframe.id === wireframeId ? (result as Wireframe) : wireframe,
          ),
        );
        return result as Wireframe;
      } catch (error) {
        console.error("Failed to update wireframe:", error);
        toast({
          title: "Error",
          description: "Failed to update wireframe",
          variant: "destructive",
        });
        throw error;
      }
    },
    [token, toast, setWireframes],
  );

  const handleVaultUpdate = useCallback(
    async (
      vaultId: number,
      updatedData: Partial<
        Omit<Vault, "id" | "user_id" | "created_at" | "updated_at">
      >,
    ) => {
      try {
        const result = await apiUpdateVault(vaultId, updatedData, token);
        setVaults((current) =>
          current.map((vault) =>
            vault.id === vaultId ? (result as Vault) : vault,
          ),
        );
        return result as Vault;
      } catch (error) {
        console.error("Failed to update vault:", error);
        toast({
          title: "Error",
          description: "Failed to update vault",
          variant: "destructive",
        });
        return null;
      }
    },
    [token, toast, setVaults],
  );

  const handleWhiteboardDelete = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await apiDeleteWhiteboard(id, token);
        toast({
          title: "Whiteboard deleted",
          description: "Whiteboard removed successfully",
        });
        setWhiteboards((current) =>
          current.filter((whiteboard) => whiteboard.id !== id),
        );
        return true;
      } catch (error) {
        console.error("Failed to delete whiteboard:", error);
        toast({
          title: "Error",
          description: "Failed to delete whiteboard",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast, setWhiteboards],
  );

  const handleWhiteboardShare = useCallback(
    (id: number) => {
      const whiteboard = whiteboards.find((candidate) => candidate.id === id);
      if (whiteboard)
        setWorkspaceShareTarget({
          itemType: "whiteboard",
          itemId: id,
          itemTitle: whiteboard.title || "Untitled Whiteboard",
          isPublic: whiteboard.is_public,
          shareToken: whiteboard.share_token,
        });
    },
    [whiteboards],
  );

  const handleWireframeDelete = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await apiDeleteWireframe(id, token);
        toast({
          title: "Wireframe deleted",
          description: "Wireframe removed successfully",
        });
        setWireframes((current) =>
          current.filter((wireframe) => wireframe.id !== id),
        );
        return true;
      } catch (error) {
        console.error("Failed to delete wireframe:", error);
        toast({
          title: "Error",
          description: "Failed to delete wireframe",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast, setWireframes],
  );

  const handleWireframeShare = useCallback(
    (id: number) => {
      const wireframe = wireframes.find((candidate) => candidate.id === id);
      if (wireframe)
        setWorkspaceShareTarget({
          itemType: "wireframe",
          itemId: id,
          itemTitle: wireframe.title || "Untitled Wireframe",
          isPublic: wireframe.is_public,
          shareToken: wireframe.share_token,
        });
    },
    [wireframes],
  );

  const enableSelectedWorkspaceSharing = useCallback(
    async (id: string | number) => {
      if (!workspaceShareTarget) throw new Error("No workspace item selected");
      let result: { shareToken: string; shareUrl: string };
      switch (workspaceShareTarget.itemType) {
        case "list":
          result = await apiShareList(String(id), token);
          break;
        case "note":
          result = await apiShareNote(Number(id), token);
          break;
        case "whiteboard":
          result = await apiShareWhiteboard(Number(id), token);
          break;
        case "wireframe":
          result = await enableWorkspaceWireframeSharingViaGraphql(Number(id));
          break;
      }
      const sharedAt = new Date().toISOString();
      if (workspaceShareTarget.itemType === "list") {
        setLists((current) =>
          current.map((item) =>
            String(item.id) === String(id)
              ? {
                  ...item,
                  is_public: true,
                  share_token: result.shareToken,
                  shared_at: sharedAt,
                }
              : item,
          ),
        );
      } else if (workspaceShareTarget.itemType === "note") {
        setNotes((current) =>
          current.map((item) =>
            item.id === Number(id)
              ? {
                  ...item,
                  is_public: true,
                  share_token: result.shareToken,
                  shared_at: sharedAt,
                }
              : item,
          ),
        );
      } else if (workspaceShareTarget.itemType === "whiteboard") {
        setWhiteboards((current) =>
          current.map((item) =>
            item.id === Number(id)
              ? {
                  ...item,
                  is_public: true,
                  share_token: result.shareToken,
                  shared_at: sharedAt,
                }
              : item,
          ),
        );
      } else {
        setWireframes((current) =>
          current.map((item) =>
            item.id === Number(id)
              ? {
                  ...item,
                  is_public: true,
                  share_token: result.shareToken,
                  shared_at: sharedAt,
                }
              : item,
          ),
        );
      }
      return result;
    },
    [
      setLists,
      setNotes,
      setWhiteboards,
      setWireframes,
      token,
      workspaceShareTarget,
    ],
  );

  const disableSelectedWorkspaceSharing = useCallback(
    async (id: string | number) => {
      if (!workspaceShareTarget) throw new Error("No workspace item selected");
      switch (workspaceShareTarget.itemType) {
        case "list":
          await apiUnshareList(String(id), token);
          break;
        case "note":
          await apiUnshareNote(Number(id), token);
          break;
        case "whiteboard":
          await apiUnshareWhiteboard(Number(id), token);
          break;
        case "wireframe":
          await disableWorkspaceWireframeSharingViaGraphql(Number(id));
          break;
      }
      const clearSharing = <
        T extends {
          id: string | number;
          is_public?: boolean;
          share_token?: string;
          shared_at?: string | Date;
        },
      >(
        item: T,
      ): T =>
        String(item.id) === String(id)
          ? {
              ...item,
              is_public: false,
              share_token: undefined,
              shared_at: undefined,
            }
          : item;
      if (workspaceShareTarget.itemType === "list")
        setLists((current) => current.map(clearSharing));
      else if (workspaceShareTarget.itemType === "note")
        setNotes((current) => current.map(clearSharing));
      else if (workspaceShareTarget.itemType === "whiteboard")
        setWhiteboards((current) => current.map(clearSharing));
      else setWireframes((current) => current.map(clearSharing));
    },
    [
      setLists,
      setNotes,
      setWhiteboards,
      setWireframes,
      token,
      workspaceShareTarget,
    ],
  );

  const handleVaultDelete = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await apiDeleteVault(id, token);
        toast({
          title: "Vault deleted",
          description: "Vault removed successfully",
        });
        setVaults((current) => current.filter((vault) => vault.id !== id));
        return true;
      } catch (error) {
        console.error("Failed to delete vault:", error);
        toast({
          title: "Error",
          description: "Failed to delete vault",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast, setVaults],
  );

  const handleVaultShare = useCallback(
    (id: number) => {
      const vault = vaults.find((candidate) => candidate.id === id);
      if (vault) setVaultToShare(vault);
    },
    [vaults],
  );

  const enableSelectedVaultSharing = useCallback(
    async (id: number) => {
      const current = vaults.find((vault) => vault.id === id);
      let result: { shareToken: string; shareUrl: string };
      if (current && isVaultZke(current)) {
        const full = await getVaultViaGraphql(id);
        const items = await decryptZkeVaultItems(full);
        const snapshot = await encryptVaultShareSnapshot(id, items);
        const shared = await enableVaultSharingViaGraphql(id, {
          ciphertext: snapshot.ciphertext,
          iv: snapshot.iv,
        });
        result = {
          shareToken: shared.shareToken,
          shareUrl: appendShareFragment(shared.shareUrl, snapshot.shareSecret),
        };
      } else {
        result = await shareVault(id, token);
      }
      setVaults((currentVaults) =>
        currentVaults.map((vault) =>
          vault.id === id
            ? {
                ...vault,
                is_public: true,
                share_token: result.shareToken,
                shared_at: new Date().toISOString(),
              }
            : vault,
        ),
      );
      return result;
    },
    [setVaults, token, vaults],
  );

  const disableSelectedVaultSharing = useCallback(
    async (id: number) => {
      await unshareVault(id, token);
      setVaults((current) =>
        current.map((vault) =>
          vault.id === id
            ? {
                ...vault,
                is_public: false,
                share_token: undefined,
                shared_at: undefined,
              }
            : vault,
        ),
      );
    },
    [setVaults, token],
  );

  const filteredAndSortedLists = useMemo(() => {
    let filtered = [...lists];
    if (categoryFilter !== "all")
      filtered = filtered.filter(
        (l) => (l.type || "General") === categoryFilter,
      );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (list) =>
          list.title?.toLowerCase().includes(query) ||
          list.type?.toLowerCase().includes(query) ||
          list.items.some((item) => item.text.toLowerCase().includes(query)),
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        case "created":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [lists, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedNotes = useMemo(() => {
    let filtered = [...notes];
    if (categoryFilter !== "all")
      filtered = filtered.filter(
        (n) => (n.category || "General") === categoryFilter,
      );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (note) =>
          note.title?.toLowerCase().includes(query) ||
          note.category?.toLowerCase().includes(query) ||
          note.content?.toLowerCase().includes(query),
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        case "created":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [notes, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedWhiteboards = useMemo(() => {
    let filtered = [...whiteboards];
    if (categoryFilter !== "all")
      filtered = filtered.filter(
        (w) => (w.category || "General") === categoryFilter,
      );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (whiteboard) =>
          whiteboard.title?.toLowerCase().includes(query) ||
          whiteboard.category?.toLowerCase().includes(query),
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        case "created":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [whiteboards, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedWireframes = useMemo(() => {
    let filtered = [...wireframes];
    if (categoryFilter !== "all")
      filtered = filtered.filter(
        (w) => (w.category || "General") === categoryFilter,
      );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (wireframe) =>
          wireframe.title?.toLowerCase().includes(query) ||
          wireframe.category?.toLowerCase().includes(query),
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        case "created":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [wireframes, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedVaults = useMemo(() => {
    let filtered = [...vaults];
    if (categoryFilter !== "all")
      filtered = filtered.filter(
        (v) => (v.category || "General") === categoryFilter,
      );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (vault) =>
          vault.title?.toLowerCase().includes(query) ||
          vault.category?.toLowerCase().includes(query) ||
          vault.items?.some((item) => item.label.toLowerCase().includes(query)),
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        case "created":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [vaults, categoryFilter, searchQuery, sortBy]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    lists.forEach((l) => cats.add(l.type || "General"));
    notes.forEach((n) => cats.add(n.category || "General"));
    whiteboards.forEach((w) => cats.add(w.category || "General"));
    wireframes.forEach((w) => cats.add(w.category || "General"));
    vaults.forEach((v) => cats.add(v.category || "General"));
    return Array.from(cats).sort();
  }, [lists, notes, whiteboards, wireframes, vaults]);

  const createNote = async (
    title: string,
    category: string,
    color: string,
    _position?: { x: number; y: number },
    _vaultSecurity?: PreparedVaultSecurity,
    presetPayload?: CreateItemPresetPayload,
  ) => {
    const initialSize = presetPayload?.initialCanvasSize ?? {
      width: 570,
      height: 350,
    };
    const position = findOpenCanvasPosition(
      [...lists, ...notes, ...whiteboards, ...wireframes, ...vaults],
      initialSize,
    );
    const created = await apiCreateNote(
      {
        title,
        content: presetPayload?.noteContent ?? "",
        category,
        color_value: color,
        width: initialSize.width,
        height: initialSize.height,
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
      },
      token,
    );
    setNotes((current) => [created as Note, ...current]);
    return created;
  };

  const createList = async (
    title: string,
    type: string,
    color: string,
    _position?: { x: number; y: number },
    _vaultSecurity?: PreparedVaultSecurity,
    presetPayload?: CreateItemPresetPayload,
  ) => {
    const initialSize = presetPayload?.initialCanvasSize ?? {
      width: 340,
      height: 265,
    };
    const position = findOpenCanvasPosition(
      [...lists, ...notes, ...whiteboards, ...wireframes, ...vaults],
      initialSize,
    );
    const created = await apiCreateList(
      {
        title,
        type,
        items: presetPayload?.listItems ?? [],
        color_value: color,
        width: initialSize.width,
        height: initialSize.height,
        position_x: position.x,
        position_y: position.y,
      },
      token,
    );
    setLists((current) => [created, ...current]);
    return created;
  };

  const createWhiteboard = async (
    title: string,
    category: string,
    color: string,
  ) => {
    const position = findOpenCanvasPosition(
      [...lists, ...notes, ...whiteboards, ...wireframes, ...vaults],
      { width: 750, height: 620 },
    );
    const created = await apiCreateWhiteboard(
      {
        title,
        category,
        color_value: color,
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
      },
      token,
    );
    setWhiteboards((current) => [created as Whiteboard, ...current]);
    return created;
  };

  const createWireframe = async (
    title: string,
    category: string,
    color: string,
    _position?: { x: number; y: number },
    _vaultSecurity?: PreparedVaultSecurity,
    presetPayload?: CreateItemPresetPayload,
  ) => {
    const initialSize = presetPayload?.initialCanvasSize ?? {
      width: 600,
      height: 600,
    };
    const position = findOpenCanvasPosition(
      [...lists, ...notes, ...whiteboards, ...wireframes, ...vaults],
      initialSize,
    );
    const created = await apiCreateWireframe(
      {
        title,
        category,
        color_value: color,
        flow_data: presetPayload?.wireframeFlowData,
        width: initialSize.width,
        height: initialSize.height,
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
      },
      token,
    );
    setWireframes((current) => [created as Wireframe, ...current]);
    return created;
  };

  const createVault = async (
    title: string,
    category: string,
    color: string,
    _position?: { x: number; y: number },
    security?: PreparedVaultSecurity,
  ) => {
    const position = findOpenCanvasPosition(
      [...lists, ...notes, ...whiteboards, ...wireframes, ...vaults],
      { width: 400, height: 300 },
    );
    const created = await apiCreateVault(
      {
        title,
        category,
        color_value: color,
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
        ...(security
          ? {
              crypto_version: security.cryptoVersion,
              kdf_salt: security.kdfSalt,
              kdf_memory_kib: security.kdfMemoryKiB,
              kdf_iterations: security.kdfIterations,
              kdf_parallelism: security.kdfParallelism,
              wrapped_vek: security.wrappedVek,
              wrapped_vek_recovery: security.wrappedVekRecovery,
            }
          : {}),
      },
      token,
    );
    let sessionReady = false;
    if (security) {
      try {
        await activatePreparedVaultSession(security.draftSessionId, created.id);
        sessionReady = true;
      } catch (sessionError) {
        console.error(
          "Vault created but its local session could not be activated:",
          sessionError,
        );
      }
    }
    const readyVault = sessionReady
      ? { ...created, client_session_unlocked: true }
      : created;
    setVaults((current) => [readyVault as Vault, ...current]);
    return readyVault;
  };

  const categoriesForModal = useMemo(() => {
    return dbCategories.map((cat) => ({
      name: cat.name,
      color_value: cat.color_value,
    }));
  }, [dbCategories]);

  const allItemsCount =
    lists.length +
    notes.length +
    whiteboards.length +
    wireframes.length +
    vaults.length;
  const totalItems =
    filteredAndSortedLists.length +
    filteredAndSortedNotes.length +
    filteredAndSortedWhiteboards.length +
    filteredAndSortedWireframes.length +
    filteredAndSortedVaults.length;
  const hasActiveFilters =
    typeFilter !== "all" ||
    categoryFilter !== "all" ||
    searchQuery.trim().length > 0;

  const clearFilters = () => {
    setTypeFilter("all");
    setCategoryFilter("all");
    setSearchQuery("");
  };

  const addContentMenu = (mode: "full" | "compact" | "header" = "full") => (
    <DropdownMenu>
      {mode === "compact" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                className="h-9 w-9 bg-blue-600 p-0 text-white hover:bg-blue-700"
                aria-label="Add content"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Add content</TooltipContent>
        </Tooltip>
      ) : mode === "header" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-11 min-w-11 gap-2 bg-blue-600 px-3 font-light text-white hover:bg-blue-700"
                aria-label="Add content"
              >
                <Plus className="h-4 w-4" />
                <HeaderActionLabel>Add</HeaderActionLabel>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Add content</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-9 bg-blue-600 px-3 font-light text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Content</span>
          </Button>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => setShowNewListModal(true)}>
          <CheckSquare className="h-4 w-4 mr-2" />
          List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowNewNoteModal(true)}>
          <StickyNote className="h-4 w-4 mr-2" />
          Note
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowNewWhiteboardModal(true)}>
          <Palette className="h-4 w-4 mr-2" />
          Whiteboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowNewWireframeModal(true)}>
          <GitBranch className="h-4 w-4 mr-2" />
          Wireframe
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowNewVaultModal(true)}>
          <KeyRound className="h-4 w-4 mr-2" />
          Vault
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const headerFilterCount =
    Number(typeFilter !== "all") +
    Number(categoryFilter !== "all") +
    Number(sortBy !== "updated");
  const secondaryHeaderFilterCount =
    Number(categoryFilter !== "all") + Number(sortBy !== "updated");
  const headerQueryCount =
    headerFilterCount + Number(searchQuery.trim().length > 0);
  const typeHeaderFilter = (
      <Select
        value={typeFilter}
        onValueChange={(value) => setTypeFilter(value as ContentType)}
      >
        <SelectTrigger className="h-11 w-[6.5rem] bg-muted/20">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="list">Lists</SelectItem>
          <SelectItem value="note">Notes</SelectItem>
          <SelectItem value="whiteboard">Whiteboards</SelectItem>
          <SelectItem value="wireframe">Wireframes</SelectItem>
          <SelectItem value="vault">Vaults</SelectItem>
        </SelectContent>
      </Select>
  );
  const secondaryHeaderFilters = (
    <>
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="h-11 w-[8.5rem] bg-muted/20">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {uniqueCategories.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sortBy}
        onValueChange={(value) => setSortBy(value as SortOption)}
      >
        <SelectTrigger className="h-11 w-[6.5rem] bg-muted/20">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="updated">Updated</SelectItem>
          <SelectItem value="created">Created</SelectItem>
          <SelectItem value="title">Title A-Z</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
  const headerFilters = (
    <>
      {typeHeaderFilter}
      {secondaryHeaderFilters}
    </>
  );

  return (
    <PageLayout
      title="CONTENTS"
      icon={<LayoutGrid className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      mobileClassName="flex-col items-stretch gap-3"
      desktopTools={{
        search: (
          <HeaderSearch
            label="Search content"
            placeholder="Search content..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        ),
        filters: (
          <div className="flex items-center gap-2">
            <HeaderFilters
              label="Filter content by type"
              activeCount={Number(typeFilter !== "all")}
              preferExpanded
            >
              {typeHeaderFilter}
            </HeaderFilters>
            <HeaderFilters
              label="Refine and sort content"
              activeCount={secondaryHeaderFilterCount}
            >
              {secondaryHeaderFilters}
            </HeaderFilters>
          </div>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter content"
            placeholder="Search content..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={headerQueryCount}
          >
            {headerFilters}
          </HeaderCombinedQuery>
        ),
        secondaryAction: (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-11 min-w-11 gap-2 px-3 font-light"
                onClick={() => navigate("/canvas")}
                aria-label="Open Canvas"
              >
                <Map className="h-4 w-4" />
                <HeaderActionLabel>Canvas</HeaderActionLabel>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Canvas</TooltipContent>
          </Tooltip>
        ),
        primaryAction: addContentMenu("header"),
      }}
      mobileActions={
        <>
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 w-full bg-muted/20 border-border/50"
              />
            </div>
            {addContentMenu("compact")}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as ContentType)}
            >
              <SelectTrigger
                className="h-11 w-full min-w-0 pr-8"
                style={{ paddingLeft: "0.375rem" }}
              >
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="list">Lists</SelectItem>
                <SelectItem value="note">Notes</SelectItem>
                <SelectItem value="whiteboard">Whiteboards</SelectItem>
                <SelectItem value="wireframe">Wireframes</SelectItem>
                <SelectItem value="vault">Vaults</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                className="h-11 w-full min-w-0 pr-8"
                style={{ paddingLeft: "0.375rem" }}
              >
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
            >
              <SelectTrigger
                className="col-span-2 h-11 w-full min-w-0 pr-8"
                style={{ paddingLeft: "0.375rem" }}
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      }
    >
      <Card aria-busy={refreshing}>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : contentError ? (
            <ErrorState
              title="Unable to load workspace"
              description={contentError}
              actionLabel="Try again"
              onAction={() => void fetchAllContent()}
            />
          ) : totalItems === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title={
                allItemsCount > 0 && hasActiveFilters
                  ? "No matches"
                  : "No content"
              }
              description={
                allItemsCount > 0 && hasActiveFilters
                  ? "Try changing or clearing your search and filters."
                  : "Get started by creating content."
              }
              className="p-12"
              action={
                allItemsCount > 0 && hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Clear filters
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Content
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-48">
                      <DropdownMenuItem
                        onClick={() => setShowNewListModal(true)}
                      >
                        <CheckSquare className="h-4 w-4 mr-2" />
                        List
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowNewNoteModal(true)}
                      >
                        <StickyNote className="h-4 w-4 mr-2" />
                        Note
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowNewWhiteboardModal(true)}
                      >
                        <Palette className="h-4 w-4 mr-2" />
                        Whiteboard
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowNewWireframeModal(true)}
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        Wireframe
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowNewVaultModal(true)}
                      >
                        <KeyRound className="h-4 w-4 mr-2" />
                        Vault
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            />
          ) : (
            <div className="space-y-6 p-6">
              {(typeFilter === "all" || typeFilter === "list") &&
                filteredAndSortedLists.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-muted-foreground" />{" "}
                      Lists
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedLists.map((list) => (
                        <ListCard
                          key={list.id}
                          list={list}
                          onUpdate={handleListUpdate}
                          onDelete={handleListDelete}
                          onShare={handleListShare}
                          existingCategories={dbCategories}
                          isCollapsed={contentCollapse.isCollapsed(
                            "list",
                            list.id,
                          )}
                          onToggleCollapsed={() =>
                            contentCollapse.toggle("list", list.id)
                          }
                          addCategory={addCategory}
                          updateCategory={editCategory}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {(typeFilter === "all" || typeFilter === "note") &&
                filteredAndSortedNotes.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <StickyNote className="h-5 w-5 text-muted-foreground" />{" "}
                      Notes
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onUpdate={handleNoteUpdate}
                          onDelete={handleNoteDelete}
                          onShare={handleNoteShare}
                          existingCategories={dbCategories}
                          isCollapsed={contentCollapse.isCollapsed(
                            "note",
                            note.id,
                          )}
                          onToggleCollapsed={() =>
                            contentCollapse.toggle("note", note.id)
                          }
                          updateCategory={editCategory}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {(typeFilter === "all" || typeFilter === "whiteboard") &&
                filteredAndSortedWhiteboards.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Palette className="h-5 w-5 text-muted-foreground" />{" "}
                      Whiteboards
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedWhiteboards.map((wb) => (
                        <WhiteboardCard
                          key={wb.id}
                          whiteboard={wb}
                          onUpdate={handleWhiteboardUpdate}
                          onDelete={handleWhiteboardDelete}
                          onShare={handleWhiteboardShare}
                          existingCategories={dbCategories}
                          isCollapsed={contentCollapse.isCollapsed(
                            "whiteboard",
                            wb.id,
                          )}
                          onToggleCollapsed={() =>
                            contentCollapse.toggle("whiteboard", wb.id)
                          }
                          updateCategory={editCategory}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {(typeFilter === "all" || typeFilter === "wireframe") &&
                filteredAndSortedWireframes.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-muted-foreground" />{" "}
                      Wireframes
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedWireframes.map((wf) => (
                        <WireframeCard
                          key={wf.id}
                          wireframe={wf}
                          onUpdate={handleWireframeUpdate}
                          onDelete={handleWireframeDelete}
                          onShare={handleWireframeShare}
                          existingCategories={dbCategories}
                          isCollapsed={contentCollapse.isCollapsed(
                            "wireframe",
                            wf.id,
                          )}
                          onToggleCollapsed={() =>
                            contentCollapse.toggle("wireframe", wf.id)
                          }
                          updateCategory={editCategory}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {(typeFilter === "all" || typeFilter === "vault") &&
                filteredAndSortedVaults.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-muted-foreground" />{" "}
                      Vaults
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedVaults.map((vault) => (
                        <VaultCard
                          key={vault.id}
                          vault={vault}
                          onUpdate={handleVaultUpdate}
                          onDelete={handleVaultDelete}
                          onShare={handleVaultShare}
                          existingCategories={dbCategories}
                          isCollapsed={contentCollapse.isCollapsed(
                            "vault",
                            vault.id,
                          )}
                          onToggleCollapsed={() =>
                            contentCollapse.toggle("vault", vault.id)
                          }
                          updateCategory={editCategory}
                        />
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {showNewNoteModal && (
        <CreateItemModal
          open={showNewNoteModal}
          onOpenChange={setShowNewNoteModal}
          itemType="note"
          onCreate={createNote}
          existingCategories={categoriesForModal}
        />
      )}
      {showNewListModal && (
        <CreateItemModal
          open={showNewListModal}
          onOpenChange={setShowNewListModal}
          itemType="list"
          onCreate={createList}
          existingCategories={categoriesForModal}
        />
      )}
      {showNewWhiteboardModal && (
        <CreateItemModal
          open={showNewWhiteboardModal}
          onOpenChange={setShowNewWhiteboardModal}
          itemType="whiteboard"
          onCreate={createWhiteboard}
          existingCategories={categoriesForModal}
        />
      )}
      {showNewWireframeModal && (
        <CreateItemModal
          open={showNewWireframeModal}
          onOpenChange={setShowNewWireframeModal}
          itemType="wireframe"
          onCreate={createWireframe}
          existingCategories={categoriesForModal}
        />
      )}
      {showNewVaultModal && (
        <CreateItemModal
          open={showNewVaultModal}
          onOpenChange={setShowNewVaultModal}
          itemType="vault"
          onCreate={createVault}
          existingCategories={categoriesForModal}
        />
      )}
      {workspaceShareTarget && (
        <ShareModal
          open
          onOpenChange={(open) => {
            if (!open) setWorkspaceShareTarget(null);
          }}
          itemType={workspaceShareTarget.itemType}
          itemId={workspaceShareTarget.itemId}
          itemTitle={workspaceShareTarget.itemTitle}
          onShare={enableSelectedWorkspaceSharing}
          onUnshare={disableSelectedWorkspaceSharing}
          existingShareData={
            workspaceShareTarget.isPublic && workspaceShareTarget.shareToken
              ? {
                  shareToken: workspaceShareTarget.shareToken,
                  shareUrl: `${window.location.origin}/shared/${workspaceShareTarget.itemType}/${workspaceShareTarget.shareToken}`,
                }
              : undefined
          }
        />
      )}
      {vaultToShare && (
        <ShareModal
          open
          onOpenChange={(open) => {
            if (!open) setVaultToShare(null);
          }}
          itemType="vault"
          itemId={vaultToShare.id}
          itemTitle={vaultToShare.title || "Untitled Vault"}
          onShare={enableSelectedVaultSharing}
          onUnshare={disableSelectedVaultSharing}
          existingShareData={
            vaultToShare.share_token && vaultToShare.is_public
              ? {
                  shareToken: vaultToShare.share_token,
                  shareUrl: `${window.location.origin}/shared/vault/${vaultToShare.share_token}`,
                }
              : undefined
          }
          isLocked={vaultToShare.is_locked && !isVaultZke(vaultToShare)}
          showWarning
        />
      )}

      {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
          content={ONBOARDING_CONTENT[onboardingFeatureKey]}
        />
      )}
    </PageLayout>
  );
}

export default ContentsPage;
