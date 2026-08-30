import React, { useState, useEffect } from 'react';
import { SharedItemCard } from '@/components/public/BrandedPublicPage';
import { Progress } from "@/components/ui/progress";
import { Check } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

interface SharedListItem {
  id: string;
  text: string;
  completed: boolean;
}

interface SharedListData {
  id: string;
  title: string;
  category: string;
  items: SharedListItem[];
  color_value?: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'list';
}

interface SharedListCardProps {
  listData: SharedListData;
  isLive?: boolean;
}

export const SharedListCard: React.FC<SharedListCardProps> = ({ listData, isLive = false }) => {
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set());
  const [previousItems, setPreviousItems] = useState(listData.items);

  const totalItems = listData.items.length;
  const completedItems = listData.items.filter(item => item.completed).length;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Use the list's color or default to blue
  const listColor = listData.color_value || '#3B82F6';

  const displayCategory = listData.category || 'General';

  // Detect changes and animate them
  useEffect(() => {
    if (!isLive || !previousItems) return;

    const newAnimatingItems = new Set<string>();

    // Check for item changes (completion status or text)
    listData.items.forEach(item => {
      const previousItem = previousItems.find(prev => prev.id === item.id);
      if (!previousItem ||
          previousItem.completed !== item.completed ||
          previousItem.text !== item.text) {
        newAnimatingItems.add(item.id);
      }
    });

    // Check for new items
    listData.items.forEach(item => {
      if (!previousItems.find(prev => prev.id === item.id)) {
        newAnimatingItems.add(item.id);
      }
    });

    setAnimatingItems(newAnimatingItems);
    setPreviousItems(listData.items);

    // Clear animations after delay
    if (newAnimatingItems.size > 0) {
      setTimeout(() => setAnimatingItems(new Set()), 1500);
    }
  }, [listData.items, isLive, previousItems]);

  return (
    <div
      className="mx-auto w-full max-w-3xl"
      data-realtime-status={isLive ? 'live' : 'offline'}
    >
      <SharedItemCard
        title={listData.title}
        contentType="list"
        category={displayCategory}
        creatorName={listData.creator_name}
        createdAt={listData.created_at}
        isLive={isLive}
        accentColor={listColor}
        contentClassName="p-0"
      >
          {/* Progress Bar */}
          {totalItems > 0 && (
            <div className="border-b border-border px-5 py-5 sm:px-7">
              <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {completedItems} of {totalItems} completed
                </span>
                <span className="tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress
                value={progress}
                className="h-2"
                indicatorStyle={{ backgroundColor: listColor }}
              />
            </div>
          )}
          
{/* List Items */}
          <div className="space-y-1 overflow-hidden p-3 sm:p-5">
            {listData.items.map((item) => (
              <div
                key={item.id}
                className={`flex min-w-0 items-center rounded-md px-3 py-2.5 transition-all duration-300 ${
                  animatingItems.has(item.id)
                    ? 'scale-[1.01] bg-primary/10 shadow-sm'
                    : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex-shrink-0 mr-2">
                  <div
                    style={item.completed ? { backgroundColor: listColor, borderColor: listColor } : {}}
                    className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      item.completed ? '' : 'border-border'
                    } ${animatingItems.has(item.id) ? 'scale-110' : ''}`}
                  >
                    {item.completed && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
                <span
                  className={`flex-1 text-sm transition-all duration-200 truncate ${
                    item.completed
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                  title={item.text}
                >
                  {item.text}
                </span>
                {/* Change indicator */}
                {!animatingItems.has(item.id) && (
                  <div className="w-2 h-2 min-w-[8px]" />
                )}
                {animatingItems.has(item.id) && (
                  <div className="h-2 w-2 min-w-[8px] flex-shrink-0 animate-ping rounded-full bg-primary" />
                )}
              </div>
            ))}
            
            {listData.items.length === 0 && (
              <EmptyState kind="inline" title="This list is empty" />
            )}
          </div>
      </SharedItemCard>
    </div>
  );
};
