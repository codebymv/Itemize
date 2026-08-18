/**
 * Diamond Node - Generic diamond shape
 * Simple, purpose-agnostic design with editable label
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, useReactFlow } from '@xyflow/react';

interface DiamondNodeData {
  label: string;
}

const DiamondNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState((data as unknown as DiamondNodeData).label || 'Diamond');

  const dataLabel = (data as unknown as DiamondNodeData).label || 'Diamond';

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
        relative flex items-center justify-center
        transition-all duration-200
        ${selected ? 'drop-shadow-lg' : ''}
      `}
      style={{
        width: '100px',
        height: '100px',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Diamond shape using CSS transform */}
      <div
        className={`
          absolute inset-0 border-2 rounded-sm
          ${selected ? 'ring-2 ring-blue-600 ring-offset-2' : ''}
        `}
        style={{
          transform: 'rotate(45deg)',
          transformOrigin: 'center',
          width: '70px',
          height: '70px',
          left: '15px',
          top: '15px',
          backgroundColor: 'hsl(var(--card))',
          borderColor: borderColor,
        }}
      />
      
      {/* Label (not rotated) */}
      <div className="relative z-10 px-2 text-center" style={{ maxWidth: '70px' }}>
        {isEditing ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full text-center text-xs font-medium bg-transparent outline-none text-foreground"
            autoFocus
          />
        ) : (
          <span 
            className="text-xs font-medium text-foreground"
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

export default memo(DiamondNode);
