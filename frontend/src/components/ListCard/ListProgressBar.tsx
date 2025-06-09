import React from 'react';

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
      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <div className="text-xs text-gray-500">
        {completedItems} of {totalItems} completed
      </div>
    </div>
  );
};
