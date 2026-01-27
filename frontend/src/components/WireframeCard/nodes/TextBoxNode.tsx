/**
 * TextBox Node - Simple text label
 * For annotations without connection handles
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow } from '@xyflow/react';
import { useTheme } from 'next-themes';

interface TextBoxNodeData {
  label: string;
  fontSize?: 'sm' | 'base' | 'lg';
}

const TextBoxNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as TextBoxNodeData).label || 'Text');
  
  const nodeData = data as TextBoxNodeData;
  const fontSize = nodeData.fontSize || 'sm';
  const dataLabel = nodeData.label || 'Text';
  
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
    if (e.key === 'Enter' && !e.shiftKey) {
      commitLabel(label);
    }
  }, [commitLabel, label]);

  const fontSizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
  }[fontSize];

  const borderColor = isLight ? '#d1d5db' : '#4b5563';

  return (
    <div
      className={`
        relative px-3 py-2 rounded border
        transition-all duration-200 min-w-[60px]
        ${selected ? 'ring-2 ring-blue-600 ring-offset-1' : ''}
      `}
      style={{
        backgroundColor: isLight ? '#fafafa' : '#1e293b',
        borderColor: borderColor,
        color: isLight ? '#374151' : '#e5e7eb',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* No handles - this is just a label */}
      {isEditing ? (
        <textarea
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`
            w-full min-w-[100px] bg-transparent outline-none resize-none
            ${fontSizeClass}
          `}
          style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}
          rows={2}
          autoFocus
        />
      ) : (
        <span 
          className={`${fontSizeClass} whitespace-pre-wrap`}
          style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default memo(TextBoxNode);
