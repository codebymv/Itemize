/**
 * Rectangle Node - Generic rectangular shape
 * Simple, purpose-agnostic design with editable label
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow } from '@xyflow/react';
import { useTheme } from 'next-themes';

interface RectangleNodeData {
  label: string;
}

const RectangleNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as RectangleNodeData).label || 'Rectangle');

  const dataLabel = (data as RectangleNodeData).label || 'Rectangle';

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

  const borderColor = isLight ? '#374151' : '#9ca3af';

  return (
    <div
      className={`
        relative px-4 py-3 rounded-md border-2 min-w-[100px] min-h-[40px]
        flex items-center justify-center text-center
        transition-all duration-200
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
      `}
      style={{
        backgroundColor: isLight ? '#ffffff' : '#1e293b',
        borderColor: borderColor,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Label */}
      {isEditing ? (
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full text-center text-sm font-medium bg-transparent outline-none"
          style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}
          autoFocus
        />
      ) : (
        <span 
          className="text-sm font-medium"
          style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default memo(RectangleNode);
