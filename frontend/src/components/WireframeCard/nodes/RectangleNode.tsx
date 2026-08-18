/**
 * Rectangle Node - Generic rectangular shape
 * Simple, purpose-agnostic design with editable label
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow } from '@xyflow/react';

interface RectangleNodeData {
  label: string;
}

const RectangleNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as unknown as RectangleNodeData).label || 'Rectangle');

  const dataLabel = (data as unknown as RectangleNodeData).label || 'Rectangle';

  useEffect(() => {
    if (!isEditing) {
      setLabel(dataLabel);
    }
  }, [dataLabel, isEditing]);
  
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);
  
  const commitLabel = useCallback((nextLabel: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, label: nextLabel } }
          : node
      )
    );
    setIsEditing(false);
  }, [id, setNodes]);

  const handleBlur = useCallback(() => {
    commitLabel(label);
  }, [commitLabel, label]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitLabel(label);
    }
  }, [commitLabel, label]);

  const borderColor = 'hsl(var(--foreground) / 0.45)';

  return (
    <div
      className={`
        relative h-full w-full px-4 py-3 rounded-md border-2 min-w-[100px] min-h-[40px]
        flex items-center justify-center text-center
        transition-all duration-200
        ${selected ? 'ring-2 ring-blue-600 ring-offset-2' : ''}
      `}
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: borderColor,
      }}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        minWidth={100}
        minHeight={40}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />
      {/* Label */}
      {isEditing ? (
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full text-center text-sm font-medium bg-transparent outline-none text-foreground"
          autoFocus
        />
      ) : (
        <span 
          className="text-sm font-medium text-foreground"
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default memo(RectangleNode);
