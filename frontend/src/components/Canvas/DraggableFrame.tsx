import React, { useEffect, useRef, useState } from 'react';
import { Archive, Check, MoreVertical, Palette, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { WorkspaceContactLink } from '@/components/workspace/WorkspaceContactLink';
import { cn } from '@/lib/utils';
import type { WorkspaceFrame } from '@/types';

export const FRAME_HEADER_HEIGHT = 48;
const MIN_FRAME_SIZE = 200;
const MAX_FRAME_SIZE = 10_000;

export interface DraggableFrameProps {
  frame: WorkspaceFrame;
  canvasTransform: { x: number; y: number; scale: number };
  /** Drag end (position) or resize end (position + size). The page moves the contained cards. */
  onMove?: (frameId: number, position: { x: number; y: number }, size?: { width: number; height: number }) => void;
  onUpdate?: (
    frameId: number,
    updatedData: Partial<Pick<WorkspaceFrame, 'title' | 'color_value' | 'contact_id' | 'contact_name'>>,
  ) => Promise<unknown>;
  onDelete?: (frameId: number) => Promise<boolean>;
  /** Archive the frame; its cards stay on the canvas. */
  onArchive?: (frameId: number) => void;
  /** Open the title for editing on mount (a frame that was just created). */
  autoEditTitle?: boolean;
  /** The DOM nodes of the cards inside this frame, so a drag moves them live. */
  resolveContained?: (frame: WorkspaceFrame) => HTMLElement[];
}

/**
 * A frame is a region behind the cards: a tinted rectangle with a header
 * strip. Only the header drags it (the body pans the canvas like empty
 * space), so a card inside stays reachable everywhere it is visible.
 */
export const DraggableFrame: React.FC<DraggableFrameProps> = ({
  frame,
  canvasTransform,
  onMove,
  onUpdate,
  onDelete,
  onArchive,
  autoEditTitle = false,
  resolveContained,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(canvasTransform);
  transformRef.current = canvasTransform;

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  // Cards inside the frame at drag start, with where they were; they follow the frame's delta.
  const carriedRef = useRef<Array<{ element: HTMLElement; left: number; top: number }>>([]);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isEditingTitle, setIsEditingTitle] = useState(autoEditTitle);
  const [titleDraft, setTitleDraft] = useState(frame.title);
  const [colorPreview, setColorPreview] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Geometry lives on the element during a gesture and comes back from props after it.
  useEffect(() => {
    const element = frameRef.current;
    if (!element || isDragging || isResizing) return;
    element.style.left = `${frame.position_x}px`;
    element.style.top = `${frame.position_y}px`;
    element.style.width = `${frame.width}px`;
    element.style.height = `${frame.height}px`;
  }, [frame.position_x, frame.position_y, frame.width, frame.height, isDragging, isResizing]);

  useEffect(() => {
    if (autoEditTitle) setIsEditingTitle(true);
  }, [autoEditTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      setTitleDraft(frame.title);
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [isEditingTitle, frame.title]);

  const canvasPoint = (event: MouseEvent | React.MouseEvent) => {
    const container = frameRef.current?.parentElement?.getBoundingClientRect();
    if (!container) return null;
    const { x, y, scale } = transformRef.current;
    return {
      x: (event.clientX - container.left - x) / scale,
      y: (event.clientY - container.top - y) / scale,
    };
  };

  const handleHeaderMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, button, [role="button"], [role="menuitem"], [role="dialog"], a')) return;
    const point = canvasPoint(event);
    const element = frameRef.current;
    if (!point || !element) return;
    event.preventDefault();
    event.stopPropagation();
    const left = parseFloat(element.style.left) || 0;
    const top = parseFloat(element.style.top) || 0;
    setDragOffset({ x: point.x - left, y: point.y - top });
    dragOriginRef.current = { x: left, y: top };
    carriedRef.current = (resolveContained?.(frame) ?? []).map((node) => ({
      element: node,
      left: parseFloat(node.style.left) || 0,
      top: parseFloat(node.style.top) || 0,
    }));
    setIsDragging(true);
  };

  const handleResizeMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const element = frameRef.current;
    if (!element) return;
    setResizeStart({
      x: event.clientX,
      y: event.clientY,
      width: parseFloat(element.style.width) || frame.width,
      height: parseFloat(element.style.height) || frame.height,
    });
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const element = frameRef.current;
    if (!element) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        const point = canvasPoint(event);
        if (!point) return;
        const nextLeft = point.x - dragOffset.x;
        const nextTop = point.y - dragOffset.y;
        element.style.left = `${nextLeft}px`;
        element.style.top = `${nextTop}px`;
        const dx = nextLeft - dragOriginRef.current.x;
        const dy = nextTop - dragOriginRef.current.y;
        for (const carried of carriedRef.current) {
          carried.element.style.left = `${carried.left + dx}px`;
          carried.element.style.top = `${carried.top + dy}px`;
        }
      } else if (isResizing) {
        const scale = transformRef.current.scale;
        const width = Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, resizeStart.width + (event.clientX - resizeStart.x) / scale));
        const height = Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, resizeStart.height + (event.clientY - resizeStart.y) / scale));
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
      }
    };

    const handleMouseUp = () => {
      const position = {
        x: parseFloat(element.style.left) || 0,
        y: parseFloat(element.style.top) || 0,
      };
      if (isDragging) {
        setIsDragging(false);
        carriedRef.current = [];
        if (position.x !== frame.position_x || position.y !== frame.position_y) {
          onMove?.(frame.id, position);
        }
      }
      if (isResizing) {
        setIsResizing(false);
        const size = {
          width: parseFloat(element.style.width) || frame.width,
          height: parseFloat(element.style.height) || frame.height,
        };
        if (size.width !== frame.width || size.height !== frame.height) {
          onMove?.(frame.id, position, size);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, frame, onMove, resolveContained]);

  const commitTitle = async () => {
    const next = titleDraft.trim();
    setIsEditingTitle(false);
    if (next && next !== frame.title) await onUpdate?.(frame.id, { title: next });
  };

  const color = colorPreview ?? frame.color_value;

  return (
    <div
      ref={frameRef}
      className="draggable-frame absolute rounded-xl border-2"
      data-testid={`frame-${frame.id}`}
      style={{
        left: frame.position_x,
        top: frame.position_y,
        width: frame.width,
        height: frame.height,
        zIndex: isDragging || isResizing ? 999 : 0,
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)`,
        boxShadow: isDragging || isResizing ? '0 8px 16px rgba(0,0,0,0.15)' : 'none',
        transition: isDragging || isResizing ? 'none' : 'box-shadow 0.2s',
        userSelect: 'none',
      }}
    >
      {/* Header: the only surface that drags the frame. */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-t-[10px] px-3 text-sm',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          height: FRAME_HEADER_HEIGHT,
          backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        }}
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={() => setIsEditingTitle(true)}
        data-frame-header
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {isEditingTitle ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitTitle();
                if (event.key === 'Escape') setIsEditingTitle(false);
              }}
              onBlur={() => void commitTitle()}
              aria-label="Frame title"
              className="h-8 max-w-xs bg-background"
              maxLength={200}
            />
            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Save frame title" onMouseDown={(event) => event.preventDefault()} onClick={() => void commitTitle()}>
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Cancel renaming" onMouseDown={(event) => event.preventDefault()} onClick={() => setIsEditingTitle(false)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="interaction-control min-w-0 flex-1 truncate text-left font-raleway font-semibold text-foreground"
            onClick={() => setIsEditingTitle(true)}
            title="Rename frame"
          >
            {frame.title}
          </button>
        )}
        <WorkspaceContactLink
          contactId={frame.contact_id}
          contactName={frame.contact_name}
          onChange={(contactId, contactName) =>
            onUpdate?.(frame.id, { contact_id: contactId, contact_name: contactName })
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Frame actions">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditingTitle(true)} className="font-raleway">
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Rename
            </DropdownMenuItem>
            <ColorPicker
              color={color}
              onChange={setColorPreview}
              onSave={(next) => {
                setColorPreview(null);
                if (next !== frame.color_value) void onUpdate?.(frame.id, { color_value: next });
              }}
            >
              <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="font-raleway">
                <Palette className="mr-2 h-4 w-4" aria-hidden="true" />
                Color
              </DropdownMenuItem>
            </ColorPicker>
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(frame.id)} className="font-raleway">
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                Archive frame
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setShowDelete(true)} className="font-raleway text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete frame
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body: empty space pans the canvas; cards render above this layer. */}
      <div className="absolute inset-x-0 bottom-0" style={{ top: FRAME_HEADER_HEIGHT }} data-canvas-pan="true" />

      <div
        className="resize-handle absolute bottom-0 right-0 h-4 w-4 cursor-nw-resize"
        onMouseDown={handleResizeMouseDown}
        style={{
          background: `linear-gradient(-45deg, transparent 40%, ${color} 40%, ${color} 60%, transparent 60%)`,
          opacity: 0.7,
        }}
        aria-hidden="true"
      />

      <DeleteDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        itemTitle={frame.title}
        itemColor={frame.color_value}
        title="Delete this frame?"
        description="The cards inside stay where they are; only the frame is removed."
        onConfirm={async () => (onDelete ? onDelete(frame.id) : false)}
      />
    </div>
  );
};

export default DraggableFrame;
