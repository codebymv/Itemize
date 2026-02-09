import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound, Key, FileText, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

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

const NEUTRAL_GRAY = '#808080';

export const SharedVaultCard: React.FC<SharedVaultCardProps> = ({ vaultData }) => {
  const { toast } = useToast();
  const vaultColor = vaultData.color_value || '#3B82F6';

  // Category display matching canvas logic
  const displayCategory = vaultData.category || 'General';
  const displayColor = displayCategory === 'General' ? NEUTRAL_GRAY : vaultColor;
  
  // Track which items are visible
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const [copiedItem, setCopiedItem] = useState<number | null>(null);
  
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
      toast({
        title: "Copied!",
        description: "Value copied to clipboard",
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
    <div className="w-full max-w-lg mx-auto">
      <Card
        className="w-full shadow-lg border bg-white dark:bg-slate-800"
        style={{
          '--vault-color': vaultColor
        } as React.CSSProperties}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" style={{ color: vaultColor }} />
            </div>
<div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate font-raleway">
                {vaultData.title}
              </h3>
              <div
                className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white mt-1 font-raleway border-none"
                style={{
                  backgroundColor: displayColor
                }}
              >
                {displayCategory}
              </div>
            </div>
          </div>
        </CardHeader>

{/* Content */}
        <CardContent className="pt-0">
          <div className="mb-3">
            <span className="text-sm text-muted-foreground">
              {vaultData.items.length} {vaultData.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {vaultData.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">This vault is empty</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-hidden">
              {vaultData.items.map((item) => {
                const isKeyValue = item.item_type === 'key_value';
                const isVisible = visibleItems.has(item.id);
                const isCopied = copiedItem === item.id;

                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors min-w-0"
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
                          <Check className="h-3.5 w-3.5 text-green-600" />
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
        </CardContent>
      </Card>

      {/* Timestamps */}
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-raleway">
          Last updated {new Date(vaultData.updated_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
