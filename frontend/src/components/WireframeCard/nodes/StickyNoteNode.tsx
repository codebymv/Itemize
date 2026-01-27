/**
 * Sticky Note Node - Miro-style sticky note
 * Yellow note with editable text
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow } from '@xyflow/react';

interface StickyNoteNodeData {
  label: string;
}

const StickyNoteNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as StickyNoteNodeData).label || 'Note');

  const dataLabel = (data as StickyNoteNodeData).label || 'Note';
  
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

  // Miro-style yellow sticky note colors
  const bgColor = '#FEF3C7';
  const borderColor = '#F59E0B';
  const textColor = '#78350F';

  return (
    <div
      className={`
        relative p-3 rounded-sm min-w-[100px] min-h-[70px] max-w-[180px]
        shadow-md transition-all duration-200
        ${selected ? 'ring-2 ring-blue-600 ring-offset-2' : ''}
      `}
      style={{
        backgroundColor: bgColor,
        borderLeft: `3px solid ${borderColor}`,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content */}
      {isEditing ? (
        <textarea
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full h-full text-xs bg-transparent outline-none resize-none"
          style={{ color: textColor, minHeight: '50px' }}
          autoFocus
        />
      ) : (
        <span 
          className="text-xs whitespace-pre-wrap break-words"
          style={{ color: textColor }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default memo(StickyNoteNode);
