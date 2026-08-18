/**
 * Speech-bubble callout for commentary and annotations.
 */
import React, { memo } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useWireframeNodeLabel } from './useWireframeNodeLabel';

interface CalloutNodeData {
  label: string;
}

const CalloutNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as CalloutNodeData;
  const { isEditing, setIsEditing, label, setLabel, handleBlur, handleKeyDown } =
    useWireframeNodeLabel(id, nodeData.label || 'Call this out', true);

  return (
    <div
      className={`relative min-h-[72px] min-w-[140px] ${selected ? 'ring-2 ring-blue-600 ring-offset-2 rounded-2xl' : ''}`}
      onDoubleClick={() => setIsEditing(true)}
    >
      <NodeResizer
        minWidth={140}
        minHeight={72}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />
      <div
        className="h-full w-full rounded-2xl border-2 px-3 py-2 text-sm"
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--foreground) / 0.4)',
        }}
      >
        {isEditing ? (
          <textarea
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-full min-h-[48px] w-full resize-none bg-transparent text-sm outline-none text-foreground"
            autoFocus
          />
        ) : (
          <span className="whitespace-pre-wrap text-sm text-foreground">{label}</span>
        )}
      </div>
      <div
        className="absolute -bottom-2 left-5 h-3 w-3 rotate-45 border-b-2 border-r-2"
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--foreground) / 0.4)',
        }}
      />
    </div>
  );
};

export default memo(CalloutNode);
