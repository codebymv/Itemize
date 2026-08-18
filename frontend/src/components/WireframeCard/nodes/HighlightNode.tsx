/**
 * Translucent highlight box for “look here” emphasis in demos.
 */
import React, { memo } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useWireframeNodeLabel } from './useWireframeNodeLabel';

interface HighlightNodeData {
  label: string;
}

const HighlightNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as HighlightNodeData;
  const { isEditing, setIsEditing, label, setLabel, handleBlur, handleKeyDown } =
    useWireframeNodeLabel(id, nodeData.label || '');

  return (
    <div
      className={`relative h-full w-full min-h-[64px] min-w-[96px] rounded-md border-2 border-dashed ${
        selected ? 'ring-2 ring-blue-600 ring-offset-2' : ''
      }`}
      style={{
        backgroundColor: 'hsl(var(--primary) / 0.12)',
        borderColor: 'hsl(var(--primary))',
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      <NodeResizer
        minWidth={96}
        minHeight={64}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />
      {(isEditing || label) && (
        <div className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          {isEditing ? (
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-20 bg-transparent outline-none"
              autoFocus
            />
          ) : (
            label
          )}
        </div>
      )}
    </div>
  );
};

export default memo(HighlightNode);
