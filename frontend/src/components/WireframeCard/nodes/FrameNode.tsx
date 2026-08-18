/**
 * Screen / device frame for demo walkthroughs.
 * Variants: browser chrome, phone, or a plain titled board.
 */
import React, { memo } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useWireframeNodeLabel } from './useWireframeNodeLabel';

interface FrameNodeData {
  label: string;
  variant?: 'browser' | 'phone' | 'board';
}

const FrameNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as FrameNodeData;
  const variant = nodeData.variant || 'browser';
  const { isEditing, setIsEditing, label, setLabel, handleBlur, handleKeyDown } =
    useWireframeNodeLabel(id, nodeData.label || 'Screen');

  const isPhone = variant === 'phone';
  const isBoard = variant === 'board';

  return (
    <div
      className={`relative flex h-full w-full min-h-[140px] min-w-[160px] flex-col overflow-hidden border-2 bg-card ${
        isPhone ? 'rounded-[1.75rem]' : 'rounded-lg'
      } ${selected ? 'ring-2 ring-blue-600 ring-offset-2' : ''}`}
      style={{ borderColor: 'hsl(var(--foreground) / 0.35)' }}
      onDoubleClick={() => setIsEditing(true)}
    >
      <NodeResizer
        minWidth={isPhone ? 140 : 200}
        minHeight={isPhone ? 240 : 140}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />

      {!isBoard && (
        <div
          className={`flex items-center gap-1.5 border-b px-2 ${isPhone ? 'h-7 justify-center' : 'h-8'}`}
          style={{ backgroundColor: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))' }}
        >
          {isPhone ? (
            <div className="h-1.5 w-12 rounded-full bg-foreground/20" />
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <div
                className="ml-1 flex h-4 min-w-0 flex-1 items-center rounded px-2 text-[10px] text-muted-foreground"
                style={{ backgroundColor: 'hsl(var(--background))' }}
              >
                {isEditing ? (
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-transparent outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1" style={{ backgroundColor: 'hsl(var(--background) / 0.55)' }}>
        {(isPhone || isBoard) && (
          <div className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {isEditing ? (
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="bg-transparent outline-none"
                autoFocus
              />
            ) : (
              <span className="truncate">{label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(FrameNode);
