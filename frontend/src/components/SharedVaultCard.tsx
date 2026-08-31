import React, { useEffect, useRef, useState } from 'react';
import { SharedItemCard } from '@/components/public/BrandedPublicPage';
import { Button } from "@/components/ui/button";
import { KeyRound, Key, FileText, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { EmptyState } from '@/components/EmptyState';

interface SharedVaultItem {
  id: number;
  item_type: 'key_value' | 'secure_note';
  label: string;
  value: string;
  order_index: number;
}

interface SharedVaultData {
  id: number;
  title: string;
  category: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  items: SharedVaultItem[];
  is_shared: boolean;
}

interface SharedVaultCardProps {
  vaultData: SharedVaultData;
}

export const SharedVaultCard: React.FC<SharedVaultCardProps> = ({ vaultData }) => {
  const { toast } = useToast();
  const vaultColor = vaultData.color_value || '#3B82F6';

  // Category display matching canvas logic
  const displayCategory = vaultData.category || 'General';
  
  // Track which items are visible
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const [copiedItem, setCopiedItem] = useState<number | null>(null);
  const clipboardClearTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (clipboardClearTimerRef.current) {
      window.clearTimeout(clipboardClearTimerRef.current);
    }
  }, []);
  
  const toggleVisibility = (itemId: number) => {
    setVisibleItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
  
  const copyToClipboard = async (value: string, itemId: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(itemId);
      if (clipboardClearTimerRef.current) {
        window.clearTimeout(clipboardClearTimerRef.current);
      }
      clipboardClearTimerRef.current = window.setTimeout(() => {
        void navigator.clipboard.writeText('').catch(() => undefined);
      }, 30_000);
      toast({
        title: 'Copied',
        description: 'Clipboard clears in 30 seconds.',
      });
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const maskedValue = '••••••••••••';

  return (
    <div className="mx-auto w-full max-w-3xl">
      <SharedItemCard
        title={vaultData.title}
        contentType="vault"
        category={displayCategory}
        updatedAt={vaultData.updated_at}
        accentColor={vaultColor}
      >
        <div className="mb-3">
            <span className="text-sm text-muted-foreground">
              {vaultData.items.length} {vaultData.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {vaultData.items.length === 0 ? (
            <EmptyState icon={KeyRound} kind="inline" title="This vault is empty" />
          ) : (
            <div className="space-y-2 overflow-hidden">
              {vaultData.items.map((item) => {
                const isKeyValue = item.item_type === 'key_value';
                const isVisible = visibleItems.has(item.id);
                const isCopied = copiedItem === item.id;

                return (
                  <div
                    key={item.id}
                    className="group interaction-row flex min-w-0 items-start gap-2 rounded-lg bg-muted/30 p-3"
                  >
                    {/* Item type icon */}
                    <div className="flex-shrink-0 pt-0.5">
                      {isKeyValue ? (
                        <Key className="h-4 w-4 flex-shrink-0" style={{ color: vaultColor }} />
                      ) : (
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-sm font-medium truncate flex-shrink min-w-0 title-overflow">
                          {item.label}
                        </span>
                        {isKeyValue && (
                          <span className="flex-shrink-0 text-muted-foreground">=</span>
                        )}
                      </div>

                      <div className="mt-1 overflow-hidden">
                        {isKeyValue ? (
                          <code className={`font-mono text-sm block break-all break-words whitespace-pre-wrap overflow-hidden ${!isVisible ? 'text-muted-foreground' : ''}`}>
                            {isVisible ? item.value : maskedValue}
                          </code>
                        ) : (
                          <p className={`text-sm block overflow-hidden break-words ${!isVisible ? 'text-muted-foreground' : ''}`}>
                            {isVisible ? item.value : maskedValue}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleVisibility(item.id)}
                        className="h-7 w-7 p-0"
                        title={isVisible ? "Hide value" : "Show value"}
                      >
                        {isVisible ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(item.value, item.id)}
                        className="h-7 w-7 p-0"
                        title="Copy value"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </SharedItemCard>
    </div>
  );
};
