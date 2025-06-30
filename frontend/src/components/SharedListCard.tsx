import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckCircle2, Circle, CheckSquare } from 'lucide-react';

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
}

export const SharedListCard: React.FC<SharedListCardProps> = ({ listData }) => {
  const totalItems = listData.items.length;
  const completedItems = listData.items.filter(item => item.completed).length;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Use the list's color or default to blue
  const listColor = listData.color_value || '#3B82F6';

  return (
    <div className="w-full max-w-md mx-auto">
      <Card 
        className="w-full shadow-lg border-2 transition-all duration-200"
        style={{ 
          borderColor: listColor,
          '--list-color': listColor 
        } as React.CSSProperties}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-gray-600" />
            <div className="flex-1">
              <h3
                className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {listData.title}
              </h3>
              {listData.category && (
                <p 
                  className="text-sm text-gray-500 dark:text-gray-400"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {listData.category}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Progress Bar */}
          {totalItems > 0 && (
            <div className="px-6 pb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span 
                  className="text-gray-600 dark:text-gray-400 italic"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {completedItems} of {totalItems} completed
                </span>
                <span 
                  className="text-gray-600 dark:text-gray-400 italic"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300 ease-in-out"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: listColor
                  }}
                />
              </div>
            </div>
          )}
          
          {/* List Items */}
          <div className="px-6 py-2 space-y-0.5">
            {listData.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center space-x-3 py-2 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex-shrink-0">
                  {item.completed ? (
                    <CheckCircle2 
                      className="h-5 w-5 text-green-500" 
                      style={{ color: listColor }}
                    />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <span
                  className={`flex-1 text-sm ${
                    item.completed
                      ? 'line-through text-gray-500 dark:text-gray-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {item.text}
                </span>
              </div>
            ))}
            
            {listData.items.length === 0 && (
              <div 
                className="text-gray-400 dark:text-gray-300 text-sm py-4 italic text-center"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                This list is empty.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Creator Attribution */}
      <div className="mt-4 text-center">
        <p 
          className="text-sm text-gray-500 dark:text-gray-400"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          Created by <span className="font-medium">{listData.creator_name}</span> on{' '}
          {new Date(listData.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
