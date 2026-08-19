import React from 'react';
import { Progress } from '@/components/ui/progress';

interface ListProgressBarProps {
  progress: number;
  totalItems: number;
  completedItems: number;
}

export const ListProgressBar: React.FC<ListProgressBarProps> = ({
  progress,
  totalItems,
  completedItems
}) => {
  return (
    <div className="px-6 py-2">
      <Progress
        value={progress}
        className="h-2 mb-1"
        indicatorStyle={{ backgroundColor: 'var(--list-color)' }}
      />
      <div className="text-xs text-gray-500 dark:text-white" style={{ fontFamily: '"Raleway", sans-serif' }}>
        {completedItems} of {totalItems} completed
      </div>
    </div>
  );
};
