/**
 * Lightweight UI mock blocks for product demos: button, input, navbar, card.
 */
import React, { memo } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useWireframeNodeLabel } from './useWireframeNodeLabel';

export type UiBlockVariant = 'button' | 'input' | 'navbar' | 'card';

interface UiBlockNodeData {
  label: string;
  variant?: UiBlockVariant;
}

const UiBlockNode: React.FC<NodeProps> = ({ id, data, selected, type }) => {
  const nodeData = data as unknown as UiBlockNodeData;
  const variant: UiBlockVariant = nodeData.variant
    || (type === 'uiInput' ? 'input' : type === 'uiNavbar' ? 'navbar' : type === 'uiCard' ? 'card' : 'button');
  const fallback = variant === 'input' ? 'Placeholder' : variant === 'navbar' ? 'Product' : variant === 'card' ? 'Card title' : 'Button';
  const { isEditing, setIsEditing, label, setLabel, handleBlur, handleKeyDown } =
    useWireframeNodeLabel(id, nodeData.label || fallback, variant === 'card');

  const shellClass = selected ? 'ring-2 ring-blue-600 ring-offset-2' : '';

  const editor = isEditing ? (
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
  );

  return (
    <div className={`relative h-full w-full ${shellClass}`} onDoubleClick={() => setIsEditing(true)}>
      <NodeResizer
        minWidth={variant === 'button' ? 72 : 120}
        minHeight={variant === 'navbar' ? 36 : 32}
        isVisible={selected}
        lineClassName="border-blue-500"
        handleClassName="h-2 w-2 bg-blue-600 border-none"
      />

      {variant === 'button' && (
        <div
          className="flex h-full min-h-[32px] min-w-[72px] items-center justify-center rounded-md px-3 text-xs font-medium text-primary-foreground"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          {editor}
        </div>
      )}

      {variant === 'input' && (
        <div
          className="flex h-full min-h-[32px] min-w-[140px] items-center rounded-md border px-2.5 text-xs text-muted-foreground"
          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
        >
          {editor}
        </div>
      )}

      {variant === 'navbar' && (
        <div
          className="flex h-full min-h-[36px] min-w-[200px] items-center justify-between gap-3 rounded-md border px-3 text-xs font-medium"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <span className="font-semibold">{editor}</span>
          <div className="flex gap-2 text-muted-foreground">
            <span>Home</span>
            <span>Docs</span>
            <span>Account</span>
          </div>
        </div>
      )}

      {variant === 'card' && (
        <div
          className="flex h-full min-h-[96px] min-w-[160px] flex-col gap-2 rounded-lg border p-3"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="text-sm font-medium">{editor}</div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded bg-muted" />
            <div className="h-1.5 w-4/5 rounded bg-muted" />
            <div className="h-1.5 w-2/3 rounded bg-muted" />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(UiBlockNode);
