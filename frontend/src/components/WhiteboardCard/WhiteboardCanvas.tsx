import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SaveStatus, type SaveState } from '@/components/ui/save-status';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Palette, Eraser, Brush, Undo, Redo, Sparkles, X } from 'lucide-react';
import { formatRelativeTime } from '../../utils/timeUtils';
import { useToast } from '@/hooks/use-toast';
import { Whiteboard } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { debounce } from 'lodash';
import { normalizeWhiteboardCanvasData, sanitizeWhiteboardPaths } from '@/lib/whiteboardCanvasData';
import { attachSketchCanvasPointerFix } from '@/utils/sketchCanvasPointer';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
// TODO: Integrate coordinate normalization for mobile canvas support
// import { processCanvasDataForLoad, processCanvasDataForSave } from '@/utils/canvasCoordinates';

interface WhiteboardCanvasProps {
  whiteboard: Whiteboard;
  onCanvasChange: (canvasData: unknown) => void;
  onSave: (data: { canvas_data: unknown; updated_at: string }) => Promise<void>;
  whiteboardColor: string;
  isMobile?: boolean;
  onScaledHeightChange?: (height: number) => void;
  updatedAt?: string;
  aiEnabled: boolean;
}

// Pre-defined color palette for easy selection
const COLOR_PALETTE = [
  '#2563eb', // Blue (default theme color)
  '#000000', // Black
  '#FF0000', // Red
  '#00FF00', // Green
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFA500', // Orange
  '#800080', // Purple
  '#A52A2A', // Brown
];

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, [contenteditable="true"]'));

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  whiteboard,
  onCanvasChange,
  onSave,
  whiteboardColor,
  isMobile = false,
  onScaledHeightChange,
  updatedAt,
  aiEnabled
}) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const { toast } = useToast();

  // Drawing tool state
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeColor, setStrokeColor] = useState('#2563eb'); // Default to theme blue
  const [strokeWidth, setStrokeWidth] = useState(isMobile ? 3 : 2); // Slightly thicker for mobile
  const [isDrawing, setIsDrawing] = useState(false);
  const [contentScale, setContentScale] = useState(1);
  
  // Auto-save state
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);
  const [lastLoadedData, setLastLoadedData] = useState<unknown[]>([]);
  const [canvasLoadTime, setCanvasLoadTime] = useState<number>(0);
  const [isIntentionalClear, setIsIntentionalClear] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const { pending: clearPending, run: runClear, dismissIfIdle: dismissClearIfIdle } = useSingleFlightAction();

  // Mobile touch state
  const [isMultiTouch, setIsMultiTouch] = useState(false);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dynamic canvas sizing - track actual container dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: whiteboard.canvas_width || 500,
    height: whiteboard.canvas_height || 500
  });

  // References for direct DOM manipulation to prevent flashing
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const pendingPathsRef = useRef<unknown[] | null>(null);
  const loadedWhiteboardIdRef = useRef(whiteboard.id);

  useUnsavedChangesGuard({
    when: saveState === 'dirty' || saveState === 'saving' || saveState === 'error',
    message: 'This whiteboard still has unsaved strokes. Leave this page anyway?',
  });
  

  // Load existing canvas data on mount
  useEffect(() => {
    if (!canvasRef.current || isCanvasLoaded) return;

    if (!whiteboard.canvas_data || whiteboard.canvas_data === '' || whiteboard.canvas_data === 'null') {
      try {
        canvasRef.current.loadPaths([]);
        setIsCanvasLoaded(true);
        setCanvasLoadTime(Date.now());
      } catch (error) {
        logger.error('Failed to initialize empty canvas:', error);
      }
      return;
    }

    try {
      const dataToLoad = sanitizeWhiteboardPaths(
        normalizeWhiteboardCanvasData(whiteboard.canvas_data),
      );

      canvasRef.current.loadPaths(dataToLoad);
      setIsCanvasLoaded(true);
      setLastLoadedData(dataToLoad);
      setCanvasLoadTime(Date.now());

    } catch (error) {
      logger.error('Failed to load canvas data; leaving the saved drawing untouched', error);
      toast({
        title: 'Could not load drawing',
        description: 'Whiteboard unavailable. Your saved data is unchanged.',
        variant: 'destructive',
      });
      setIsCanvasLoaded(true);
    }
  }, [whiteboard.canvas_data, isCanvasLoaded, toast]);

  useEffect(() => {
    if (loadedWhiteboardIdRef.current === whiteboard.id) return;
    loadedWhiteboardIdRef.current = whiteboard.id;
    setIsCanvasLoaded(false);
    setLastLoadedData([]);
  }, [whiteboard.id]);

  // Calculate content scale for mobile responsiveness
  useEffect(() => {
    if (isMobile && canvasContainerRef.current) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const renderedWidth = entry.contentRect.width;
          if (whiteboard.canvas_width && renderedWidth > 0) {
            const scale = renderedWidth / whiteboard.canvas_width;
            setContentScale(scale);
            if (onScaledHeightChange) {
              onScaledHeightChange(whiteboard.canvas_height * scale);
            }
          }
        }
      });

      observer.observe(canvasContainerRef.current);

      return () => observer.disconnect();
    } else if (!isMobile) {
      setContentScale(1); // Reset scale for desktop
    }
  }, [isMobile, onScaledHeightChange, whiteboard.canvas_height, whiteboard.canvas_width]);

  // Layout size only — getBoundingClientRect is post-zoom and would desync the SVG bitmap.
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const applyLayoutSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const next = { width: Math.floor(width), height: Math.floor(height) };
      setCanvasDimensions((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        applyLayoutSize(entry.contentRect.width, entry.contentRect.height);
      }
    });

    observer.observe(canvasContainerRef.current);
    applyLayoutSize(
      canvasContainerRef.current.clientWidth,
      canvasContainerRef.current.clientHeight,
    );

    return () => observer.disconnect();
  }, [updatedAt]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    return attachSketchCanvasPointerFix(container);
  }, []);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timeout = window.setTimeout(() => setSaveState('idle'), 1600);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  // Debug canvas dimensions changes
  useEffect(() => {
    logger.log('🎨 Canvas dimensions updated:', canvasDimensions);
  }, [canvasDimensions]);

  const persistCanvasData = useCallback(async (canvasData: unknown[]) => {
    try {
      const sanitizedCanvasData = sanitizeWhiteboardPaths(canvasData);
      setSaveState('saving');
      await onSave({ canvas_data: sanitizedCanvasData, updated_at: new Date().toISOString() });
      if (pendingPathsRef.current === canvasData) pendingPathsRef.current = null;
      setSaveState('saved');
    } catch (error) {
      logger.error('Canvas auto-save failed:', error);
      setSaveState('error');
      toast({
        title: 'Could not save drawing',
        description: 'Strokes preserved. Retry after reconnecting.',
        variant: 'destructive',
      });
    }
  }, [onSave, toast]);

  // Debounced auto-save function (reduced delay for faster saves)
  const debouncedAutoSave = useMemo(
    () => debounce((canvasData: unknown[]) => {
      void persistCanvasData(canvasData);
    }, 500),
    [persistCanvasData]
  );

  // Handle drawing end with auto-save trigger
  const handleDrawingEnd = useCallback(async () => {
    logger.log('🎨 handleDrawingEnd called.');
    setIsDrawing(false);
    
    // Only auto-save if there are actual changes
    if (!canvasRef.current) return;
    
    // Prevent auto-saves immediately after loading data (canvas library needs time to render)
    const timeSinceLoad = Date.now() - canvasLoadTime;
    if (timeSinceLoad < 500) { // Wait 500ms after loading before auto-saving (reduced from 2000ms)
      logger.log('🎨 Skipping auto-save - too soon after canvas load:', { timeSinceLoad });
      return;
    }
    
    try {
      const currentCanvasData = await canvasRef.current.exportPaths();
      logger.log('🎨 WhiteboardCanvas: Raw exported paths:', currentCanvasData);
      
      // Validate canvas data before processing
      if (!Array.isArray(currentCanvasData)) {
        logger.warn('🎨 Invalid canvas data format from exportPaths - not an array:', typeof currentCanvasData);
        return;
      }

      // Test JSON serialization to catch malformed data early
      try {
        const testSerialization = JSON.stringify(currentCanvasData);
        JSON.parse(testSerialization); // This will throw if the JSON is malformed
      } catch (jsonError) {
        console.error('🎨 Canvas data is corrupted and cannot be processed:', jsonError);
        return;
      }
      
      // Normalize the saved data for comparison (handle different storage formats)
      let normalizedSavedData = [];
      if (whiteboard.canvas_data) {
        if (Array.isArray(whiteboard.canvas_data)) {
          normalizedSavedData = whiteboard.canvas_data;
        } else if (typeof whiteboard.canvas_data === 'object' && whiteboard.canvas_data.paths) {
          normalizedSavedData = whiteboard.canvas_data.paths || [];
        } else if (typeof whiteboard.canvas_data === 'string') {
          try {
            const parsed = JSON.parse(whiteboard.canvas_data);
            normalizedSavedData = Array.isArray(parsed) ? parsed : (parsed.paths || []);
          } catch {
            normalizedSavedData = [];
          }
        }
      }
      
      const currentDataString = JSON.stringify(currentCanvasData);
      const savedDataString = JSON.stringify(normalizedSavedData);
      
      logger.log('🎨 Canvas change detection:', {
        currentPaths: currentCanvasData?.length || 0,
        savedPaths: normalizedSavedData?.length || 0,
        hasChanges: currentDataString !== savedDataString,
        currentDataPreview: currentDataString.substring(0, 100),
        savedDataPreview: savedDataString.substring(0, 100),
        currentDataFull: currentDataString,
        savedDataFull: savedDataString
      });
      
      // Only trigger auto-save if canvas data actually changed
      if (currentDataString !== savedDataString) {
        logger.log('🎨 Canvas changes detected, scheduling auto-save...');
        
        // Prevent accidental clearing - if we expect content but get empty, skip save
        // Unless it's an intentional clear operation
        if (currentCanvasData.length === 0 && (lastLoadedData.length > 0 || normalizedSavedData.length > 0) && !isIntentionalClear) {
          logger.warn('🎨 Preventing accidental canvas clear - expected content but got empty data', {
            expectedPaths: Math.max(lastLoadedData.length, normalizedSavedData.length),
            currentPaths: currentCanvasData.length,
            timeSinceLoad: Date.now() - canvasLoadTime,
            lastLoadedCount: lastLoadedData.length,
            savedDataCount: normalizedSavedData.length,
            isIntentionalClear
          });
          return;
        } else if (isIntentionalClear && currentCanvasData.length === 0) {
          logger.log('🎨 Allowing intentional canvas clear');
        }
        
        pendingPathsRef.current = currentCanvasData;
        setSaveState('dirty');
        debouncedAutoSave(currentCanvasData);
      } else {
        logger.log('🎨 No canvas changes detected, skipping auto-save');
      }
    } catch (error) {
      console.error('Failed to check canvas changes:', error);
    }
  }, [debouncedAutoSave, whiteboard.canvas_data, canvasRef, lastLoadedData, canvasLoadTime, isIntentionalClear]);

  useEffect(() => {
    const persistPending = () => {
      debouncedAutoSave.cancel();
      const pending = pendingPathsRef.current;
      if (!pending) return;
      void persistCanvasData(pending);
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') persistPending();
    };

    window.addEventListener('beforeunload', persistPending);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      persistPending();
      window.removeEventListener('beforeunload', persistPending);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [debouncedAutoSave, persistCanvasData]);

  const retrySave = useCallback(() => {
    const pending = pendingPathsRef.current;
    if (pending) void persistCanvasData(pending);
  }, [persistCanvasData]);

  // Handle tool change
  const handleToolChange = (tool: 'pen' | 'eraser') => {
    setCurrentTool(tool);
    if (canvasRef.current) {
      if (tool === 'eraser') {
        canvasRef.current.eraseMode(true);
      } else {
        canvasRef.current.eraseMode(false);
      }
    }
  };

  // Handle color change
  const handleColorChange = (color: string) => {
    setStrokeColor(color);
    if (currentTool === 'pen') {
      // Color only applies to pen mode
      setCurrentTool('pen');
      if (canvasRef.current) {
        canvasRef.current.eraseMode(false);
      }
    }
  };

  // Handle stroke width change
  const handleStrokeWidthChange = (width: number[]) => {
    setStrokeWidth(width[0]);
  };

  const handleUndo = () => {
    if (!canvasRef.current) return;
    canvasRef.current.undo();
    window.setTimeout(() => {
      void handleDrawingEnd();
    }, 50);
  };

  const handleRedo = () => {
    if (!canvasRef.current) return;
    canvasRef.current.redo();
    window.setTimeout(() => {
      void handleDrawingEnd();
    }, 50);
  };

  const handleClear = async () => {
    if (!canvasRef.current) return;
    await runClear(async () => {
      // A debounced pre-clear snapshot must never run after the explicit clear.
      debouncedAutoSave.cancel();
      setIsIntentionalClear(true);
      canvasRef.current?.clearCanvas();
      pendingPathsRef.current = [];
      try {
        setSaveState('saving');
        await onSave({ canvas_data: [], updated_at: new Date().toISOString() });
        pendingPathsRef.current = null;
        setLastLoadedData([]);
        setSaveState('saved');
      } catch (error) {
        logger.error('Failed to save cleared canvas:', error);
        setSaveState('error');
      } finally {
        setShowClearConfirm(false);
        window.setTimeout(() => setIsIntentionalClear(false), 1000);
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) return;

    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handleRedo();
      return;
    }
    if (event.key === '[') {
      event.preventDefault();
      setStrokeWidth((width) => Math.max(1, width - 1));
      return;
    }
    if (event.key === ']') {
      event.preventDefault();
      setStrokeWidth((width) => Math.min(20, width + 1));
      return;
    }
    if (!mod && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      handleToolChange('eraser');
      return;
    }
    if (!mod && (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'p')) {
      event.preventDefault();
      handleToolChange('pen');
    }
  };

  // Mobile touch gesture helpers
  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touch1: React.Touch, touch2: React.Touch) => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  };

  // Mobile touch event handlers - enhanced for proper multi-touch detection
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;

    logger.log(`Touch start: ${e.touches.length} fingers`);

    if (e.touches.length === 2) {
      // Two-finger gesture - prevent drawing and enable pan/zoom
      e.preventDefault();
      e.stopPropagation(); // Stop event from reaching canvas
      setIsMultiTouch(true);
      setIsDrawing(false);
      
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setInitialPinchDistance(distance);
      
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      setPanStart(center);
      
      logger.log('Multi-touch enabled for pan/zoom');
    } else if (e.touches.length === 1) {
      // Single finger - allow drawing mode only if not coming from multi-touch
      if (!isMultiTouch) {
        logger.log('Single finger - drawing mode');
      }
      // Don't immediately set isMultiTouch to false here, wait for touchend
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile) return;

    // Always handle multi-touch gestures, regardless of current state
    if (e.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation(); // Prevent canvas from receiving this event
      
      // Enable multi-touch if not already enabled
      if (!isMultiTouch) {
        setIsMultiTouch(true);
        setIsDrawing(false);
        const distance = getTouchDistance(e.touches[0], e.touches[1]);
        setInitialPinchDistance(distance);
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        setPanStart(center);
        logger.log('Multi-touch enabled during move');
        return;
      }

      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      
      // Handle pinch-to-zoom
      if (initialPinchDistance > 0) {
        const scaleChange = currentDistance / initialPinchDistance;
        const newScale = Math.min(3, Math.max(0.25, canvasScale * scaleChange));
        setCanvasScale(newScale);
        setInitialPinchDistance(currentDistance);
      }
      
      // Handle pan
      const deltaX = currentCenter.x - panStart.x;
      const deltaY = currentCenter.y - panStart.y;
      const newPan = {
        x: canvasPan.x + deltaX * 0.8, // Less dampening for more responsive feel
        y: canvasPan.y + deltaY * 0.8
      };
      setCanvasPan(newPan);
      setPanStart(currentCenter);
    } else if (isMultiTouch && e.touches.length === 1) {
      // One finger remains after multi-touch - prevent drawing until touch end
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;

    logger.log(`Touch end: ${e.touches.length} fingers remaining`);

    // Reset multi-touch when no fingers or only one finger remains
    if (e.touches.length < 2) {
      if (isMultiTouch) {
        logger.log('Exiting multi-touch mode');
        setIsMultiTouch(false);
        setInitialPinchDistance(0);
        setIsDrawing(false);
      }
    }
  };

  // Prevent scroll when drawing on mobile
  useEffect(() => {
    if (!isMobile) return;

    const preventScroll = (e: TouchEvent) => {
      if (isDrawing && !isMultiTouch) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [isDrawing, isMultiTouch, isMobile]);



  return (
    <div 
      className="flex flex-col h-full relative"
      data-whiteboard-canvas
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (isTypingTarget(event.target)) return;
        event.currentTarget.focus();
      }}
    >
      <style>
        {`
          .react-sketch-canvas,
          .react-sketch-canvas canvas {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
          }
        `}
      </style>

      {/* Toolbar - always visible */}
      <div className="flex items-center justify-between p-2 border-b bg-muted" style={{ borderBottomColor: 'hsl(var(--border))' }}>
        <div className="flex flex-col gap-2 w-full">
          {/* Main Row - responsive layout */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Left side: Tool, Brush Size */}
            <div className="flex-shrink-0 flex items-center gap-2">
              {/* Tool selection */}
              <div className="flex items-center gap-1 p-1 rounded-md border bg-card border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('pen')}
                  aria-label="Pen"
                  title="Pen (B)"
                  className={cn("h-8 w-8 p-0 text-foreground", currentTool === 'pen' ? 'bg-blue-600 interaction-button--primary text-white' : '')}
                >
                  <Brush className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('eraser')}
                  aria-label="Eraser"
                  title="Eraser (E)"
                  className={cn("h-8 w-8 p-0 text-foreground", currentTool === 'eraser' ? 'bg-blue-600 interaction-button--primary text-white' : '')}
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>
              {/* Brush size slider */}
              <div className="flex items-center gap-2 p-2 rounded-md border bg-card border-border">
                <span className="text-xs font-medium min-w-[20px] text-foreground">{strokeWidth}</span>
                <Slider
                  value={[strokeWidth]}
                  onValueChange={handleStrokeWidthChange}
                  max={20}
                  min={1}
                  step={1}
                  className="w-12 sm:w-24 [&>*]:bg-muted [&>*>*]:bg-blue-600 [&>*:last-child]:border-blue-600 [&>*:last-child]:bg-card"
                />
              </div>
            </div>

            {/* Color palette - shows inline on desktop, wraps on mobile */}
            {currentTool === 'pen' && (
              <div className="flex items-center gap-1 p-1 rounded-md border bg-card border-border order-last sm:order-none">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={`w-6 h-6 rounded-sm border-2 ${strokeColor === color ? 'border-foreground' : 'border-border'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select ${color} color`}
                  />
                ))}
              </div>
            )}

            {/* Spacer - only on desktop */}
            <div className="flex-grow hidden sm:block" />

            {/* Right side: Actions */}
            <div className="flex-shrink-0 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
                className="h-8 w-8 p-0 text-foreground"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                aria-label="Redo"
                title="Redo (Ctrl+Y)"
                className="h-8 w-8 p-0 text-foreground"
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                disabled={clearPending}
                aria-label="Clear canvas"
                title="Clear canvas"
                className="h-8 w-8 p-0 text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area - flex-1 takes remaining space, like textarea in note cards */}
      <div className="flex-1 relative overflow-hidden" style={{ paddingBottom: updatedAt ? '36px' : '8px' }}>
        <div 
          ref={canvasContainerRef}
          className="w-full h-full relative whiteboard-drawing-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => {
            handleTouchEnd(e);
            // Explicitly call handleDrawingEnd if a single-finger drawing was in progress
            if (isDrawing && !isMultiTouch) {
              handleDrawingEnd();
            }
          }}
          style={{ 
            transform: isMobile ? `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})` : 'none',
            transformOrigin: 'center',
            transition: isMultiTouch ? 'none' : 'transform 0.1s ease-out',
            cursor: currentTool === 'eraser' ? 'cell' : 'crosshair'
          }}
        >
          <ReactSketchCanvas
            className="react-sketch-canvas"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              backgroundColor: '#ffffff'
            }}
            width={`${canvasDimensions.width}px`}
            height={`${canvasDimensions.height}px`}
            strokeWidth={strokeWidth}
            strokeColor={strokeColor}
            canvasColor="#ffffff"
            ref={canvasRef}
            onStroke={(path) => {
              logger.log('🎨 onStroke triggered - stroke completed', path);
              setIsDrawing(true);
              // Trigger auto-save after each stroke completes
              setTimeout(() => {
                handleDrawingEnd();
              }, 100); // Small delay to ensure canvas is updated
            }}
          />

        </div>

        {/* Footer - positioned absolutely at bottom of this container */}
        {(updatedAt || saveState !== 'idle') && (
          <div 
            className="absolute bottom-0 left-0 right-0 px-2 md:px-3 py-1 md:py-2 z-10 border-t bg-card border-border"
            style={{
              fontSize: '10px'
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className="text-muted-foreground truncate text-xs md:text-xs font-raleway"
                style={{ 
                  fontSize: 'inherit'
                }}
              >
                {saveState !== 'idle' ? (
                  <SaveStatus state={saveState} onRetry={retrySave} />
                ) : updatedAt ? (
                  <>
                    <span className="hidden sm:inline">Last edited: </span>
                    <span className="sm:hidden">Edited: </span>
                    {formatRelativeTime(updatedAt)}
                  </>
                ) : null}
              </div>
              {/* TODO: Re-enable when adding AI functionality to whiteboards
              {aiEnabled && (
                <div title="AI-powered suggestions enabled" className="flex-shrink-0 ml-1 md:ml-2">
                  <Sparkles 
                    className="h-2.5 w-2.5 md:h-3 md:w-3" 
                    style={{ color: whiteboardColor }}
                  />
                </div>
              )}
              */}
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={showClearConfirm} onOpenChange={open => {
        if (open) setShowClearConfirm(true);
        else dismissClearIfIdle(() => setShowClearConfirm(false));
      }}>
        <AlertDialogContent aria-busy={clearPending ? 'true' : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this whiteboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every stroke on the board. You can undo only until the clear is saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearPending}
              onClick={event => {
                event.preventDefault();
                void handleClear();
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
