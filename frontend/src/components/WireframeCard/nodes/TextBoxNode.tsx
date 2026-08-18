/**
 * TextBox Node - Simple text label
 * For annotations without connection handles
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow } from '@xyflow/react';

interface TextBoxNodeData {
  label: string;
  fontSize?: 'sm' | 'base' | 'lg';
}

const TextBoxNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as unknown as TextBoxNodeData).label || 'Text');
  
  const nodeData = data as unknown as TextBoxNodeData;
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

  const borderColor = 'hsl(var(--border))';

  return (
    <div
      className={`
        relative px-3 py-2 rounded border h-full w-full min-h-[40px] min-w-[80px]
        transition-all duration-200
        ${selected ? 'ring-2 ring-blue-600 ring-offset-1' : ''}
      `}
      style={{
        backgroundColor: 'hsl(var(--muted))',
        borderColor: borderColor,
        color: 'hsl(var(--foreground))',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        minWidth={80}
        minHeight={40}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />
      {/* No handles - this is just a label */}
      {isEditing ? (
        <textarea
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`
            w-full min-w-[100px] bg-transparent outline-none resize-none text-foreground
            ${fontSizeClass}
          `}
          rows={2}
          autoFocus
        />
      ) : (
        <span 
          className={`${fontSizeClass} whitespace-pre-wrap text-foreground`}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default memo(TextBoxNode);
