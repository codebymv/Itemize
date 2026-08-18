/**
 * Numbered step badge for walkthroughs and video outlines.
 */
import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { useWireframeNodeLabel } from './useWireframeNodeLabel';

interface StepNodeData {
  label: string;
  caption?: string;
}

const StepNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as StepNodeData;
  const { isEditing, setIsEditing, label, setLabel, handleBlur, handleKeyDown } =
    useWireframeNodeLabel(id, nodeData.label || '1');

  return (
    <div
      className={`flex flex-col items-center gap-1 ${selected ? 'ring-2 ring-blue-600 ring-offset-2 rounded-full' : ''}`}
      onDoubleClick={() => setIsEditing(true)}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-md"
        style={{ backgroundColor: 'hsl(var(--primary))' }}
      >
        {isEditing ? (
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-7 bg-transparent text-center text-sm outline-none"
            autoFocus
          />
        ) : (
          <span>{label}</span>
        )}
      </div>
    </div>
  );
};

export default memo(StepNode);
