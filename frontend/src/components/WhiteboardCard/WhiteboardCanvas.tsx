import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Palette, Eraser, Brush, Undo, Redo } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Whiteboard } from '@/types';
import { cn } from '@/lib/utils';
import { debounce } from 'lodash';

interface WhiteboardCanvasProps {
  whiteboard: Whiteboard;
  onCanvasChange: (canvasData: any) => void;
  onSave: (canvasData: any) => void;
  whiteboardColor: string;
  onAutoSave: (canvasData: any) => Promise<void>;
  isMobile?: boolean;
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

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  whiteboard,
  onCanvasChange,
  onSave,
  whiteboardColor,
  onAutoSave,
  isMobile = false
}) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const { toast } = useToast();
  
  // Drawing tool state
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeColor, setStrokeColor] = useState('#2563eb'); // Default to theme blue
  const [strokeWidth, setStrokeWidth] = useState(isMobile ? 3 : 2); // Slightly thicker for mobile
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Auto-save state
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);
  const [lastLoadedData, setLastLoadedData] = useState<any[]>([]);
  const [canvasLoadTime, setCanvasLoadTime] = useState<number>(0);
  const [isIntentionalClear, setIsIntentionalClear] = useState(false);
  
  // Mobile touch state
  const [isMultiTouch, setIsMultiTouch] = useState(false);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Mobile UI state (to prevent flashing)
  const [isResizing, setIsResizing] = useState(false);
  const [gestureScale, setGestureScale] = useState(1);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [showGestureHint, setShowGestureHint] = useState(false);

  // References for direct DOM manipulation to prevent flashing
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const visualUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing canvas data on mount
  useEffect(() => {
    if (canvasRef.current && whiteboard.canvas_data && !isCanvasLoaded) {
      try {
        console.log('🎨 Loading canvas data:', {
          dataType: typeof whiteboard.canvas_data,
          isArray: Array.isArray(whiteboard.canvas_data),
          dataLength: Array.isArray(whiteboard.canvas_data) ? whiteboard.canvas_data.length : 'N/A',
          dataPreview: JSON.stringify(whiteboard.canvas_data).substring(0, 300)
        });
        
        // Validate canvas data format - should be an array of CanvasPath objects
        let dataToLoad = whiteboard.canvas_data;
        
        // Handle different data formats from database
        if (Array.isArray(dataToLoad)) {
          // Direct array format - already correct
          console.log('🎨 Data is already in array format');
        } else if (dataToLoad && typeof dataToLoad === 'object' && dataToLoad.paths) {
          // Object format with paths property from backend
          console.log('🎨 Data is in object format with paths, extracting array');
          dataToLoad = dataToLoad.paths;
        } else if (typeof dataToLoad === 'string') {
          // String format - try to parse
          try {
            const parsed = JSON.parse(dataToLoad);
            if (Array.isArray(parsed)) {
              dataToLoad = parsed;
            } else if (parsed && typeof parsed === 'object' && parsed.paths) {
              dataToLoad = parsed.paths;
            } else {
              throw new Error('Invalid parsed format');
            }
          } catch (e) {
            console.warn('🎨 Failed to parse string canvas data:', e);
            dataToLoad = [];
          }
        } else {
          console.warn('🎨 Unknown data format, using empty array');
          dataToLoad = [];
        }
        
        // Validate that we have an array of path objects
        if (!Array.isArray(dataToLoad)) {
          console.warn('🎨 Data is not an array after processing:', typeof dataToLoad);
          dataToLoad = [];
        }
        
        // If we have data but it's missing required metadata, reconstruct it
        if (dataToLoad.length > 0) {
          const firstPath = dataToLoad[0];
          if (!firstPath.drawMode || !firstPath.strokeColor || !firstPath.strokeWidth) {
            console.log('🎨 Reconstructing missing metadata for canvas paths');
            dataToLoad = dataToLoad.map((pathData: any, index: number) => ({
              drawMode: true,
              strokeColor: pathData.strokeColor || '#2563eb', // Default to theme blue
              strokeWidth: pathData.strokeWidth || 2,
              paths: pathData.paths || pathData || []
            }));
          }
        }
        
        console.log('🎨 Final data to load:', {
          isArray: Array.isArray(dataToLoad),
          length: Array.isArray(dataToLoad) ? dataToLoad.length : 'N/A',
          dataPreview: JSON.stringify(dataToLoad).substring(0, 300)
        });
        
        // Ensure the data is an array (expected format for loadPaths)
        if (Array.isArray(dataToLoad)) {
          // Suppress React-Sketch-Canvas warnings/errors for empty data
          const originalWarn = console.warn;
          const originalError = console.error;
          
          console.warn = (...args) => {
            if (args[0]?.includes?.('No stroke found')) return;
            originalWarn.apply(console, args);
          };
          
          console.error = (...args) => {
            if (args[0]?.includes?.('No stroke found')) return;
            originalError.apply(console, args);
          };
          
          canvasRef.current.loadPaths(dataToLoad);
          setIsCanvasLoaded(true);
          setLastLoadedData(dataToLoad);
          setCanvasLoadTime(Date.now());
          
          // Clear any pending auto-save timeouts to prevent overwriting the loaded data
          if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            setAutoSaveTimeout(null);
            console.log('🎨 Cleared pending auto-save timeout after loading data');
          }
          
          console.log('🎨 Canvas data loaded successfully');
          
          // Restore original console methods
          console.warn = originalWarn;
          console.error = originalError;
        } else {
          console.warn('🎨 Invalid canvas data format, using empty canvas:', {
            dataType: typeof dataToLoad,
            dataValue: dataToLoad
          });
          canvasRef.current.loadPaths([]);
          setIsCanvasLoaded(true);
          setLastLoadedData([]);
          setCanvasLoadTime(Date.now());
          
          // Clear any pending auto-save timeouts
          if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            setAutoSaveTimeout(null);
          }
        }
      } catch (error) {
        console.error('🎨 Failed to load canvas data:', error);
        // Load empty canvas on error
        try {
          canvasRef.current.loadPaths([]);
          setIsCanvasLoaded(true);
          setLastLoadedData([]);
          setCanvasLoadTime(Date.now());
          
          // Clear any pending auto-save timeouts
          if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            setAutoSaveTimeout(null);
          }
        } catch (fallbackError) {
          console.error('🎨 Failed to load empty canvas:', fallbackError);
        }
      }
    }
  }, [whiteboard.canvas_data, isCanvasLoaded, autoSaveTimeout]);

  // Debounced auto-save function (reduced delay for faster saves)
  const debouncedAutoSave = useCallback(
    debounce(async (canvasData: any[], whiteboardId: number) => {
      try {
        console.log('🎨 Auto-saving canvas data:', {
          pathCount: canvasData.length,
          dataPreview: JSON.stringify(canvasData).substring(0, 100),
          whiteboardId
        });
        await onSave(canvasData);
        console.log('🎨 Canvas auto-save completed successfully');
      } catch (error) {
        console.error('🎨 Canvas auto-save failed:', error);
      }
    }, 500), // Reduced from 2000ms to 500ms for faster saves
    [onSave]
  );

  // Handle drawing start
  const handleDrawingStart = () => {
    setIsDrawing(true);
  };

  // Handle drawing end with auto-save trigger
  const handleDrawingEnd = useCallback(async () => {
    setIsDrawing(false);
    
    // Only auto-save if there are actual changes
    if (!canvasRef.current) return;
    
    // Prevent auto-saves immediately after loading data (canvas library needs time to render)
    const timeSinceLoad = Date.now() - canvasLoadTime;
    if (timeSinceLoad < 2000) { // Wait 2 seconds after loading before auto-saving
      console.log('🎨 Skipping auto-save - too soon after canvas load:', { timeSinceLoad });
      return;
    }
    
    try {
      const currentCanvasData = await canvasRef.current.exportPaths();
      
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
      
      console.log('🎨 Canvas change detection:', {
        currentPaths: currentCanvasData?.length || 0,
        savedPaths: normalizedSavedData?.length || 0,
        hasChanges: currentDataString !== savedDataString,
        currentDataPreview: currentDataString.substring(0, 100),
        savedDataPreview: savedDataString.substring(0, 100)
      });
      
      // Only trigger auto-save if canvas data actually changed
      if (currentDataString !== savedDataString) {
        console.log('🎨 Canvas changes detected, scheduling auto-save...');
        
        // Prevent accidental clearing - if we expect content but get empty, skip save
        // Unless it's an intentional clear operation
        if (currentCanvasData.length === 0 && (lastLoadedData.length > 0 || normalizedSavedData.length > 0) && !isIntentionalClear) {
          console.warn('🎨 Preventing accidental canvas clear - expected content but got empty data', {
            expectedPaths: Math.max(lastLoadedData.length, normalizedSavedData.length),
            currentPaths: currentCanvasData.length,
            timeSinceLoad: Date.now() - canvasLoadTime,
            lastLoadedCount: lastLoadedData.length,
            savedDataCount: normalizedSavedData.length,
            isIntentionalClear
          });
          return;
        } else if (isIntentionalClear && currentCanvasData.length === 0) {
          console.log('🎨 Allowing intentional canvas clear');
        }
        
        // Clear existing timeout
        if (autoSaveTimeout) {
          clearTimeout(autoSaveTimeout);
        }
        
        // Set new auto-save timeout for 3 seconds after drawing stops
        const timeout = setTimeout(() => {
          debouncedAutoSave(currentCanvasData, whiteboard.id);
        }, 3000);
        
        setAutoSaveTimeout(timeout);
      } else {
        console.log('🎨 No canvas changes detected, skipping auto-save');
      }
    } catch (error) {
      console.error('Failed to check canvas changes:', error);
    }
  }, [autoSaveTimeout, debouncedAutoSave, whiteboard.canvas_data, canvasRef, lastLoadedData, canvasLoadTime, isIntentionalClear]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
    };
  }, [autoSaveTimeout]);

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

  // Handle undo
  const handleUndo = () => {
    if (canvasRef.current) {
      canvasRef.current.undo();
    }
  };

  // Handle redo
  const handleRedo = () => {
    if (canvasRef.current) {
      canvasRef.current.redo();
    }
  };

  // Handle clear canvas
  const handleClear = async () => {
    if (canvasRef.current) {
      setIsIntentionalClear(true);
      canvasRef.current.clearCanvas();
      
      // Immediately save the cleared state
      try {
        await onSave([]);
        setLastLoadedData([]);
        console.log('🎨 Canvas cleared and saved successfully');
      } catch (error) {
        console.error('🎨 Failed to save cleared canvas:', error);
      } finally {
        // Reset the flag after a short delay
        setTimeout(() => setIsIntentionalClear(false), 1000);
      }
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

  // Mobile touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;

    if (e.touches.length === 2) {
      // Two-finger gesture - prevent drawing and enable pan/zoom
      e.preventDefault();
      setIsMultiTouch(true);
      setIsDrawing(false);
      
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setInitialPinchDistance(distance);
      
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      setPanStart(center);
    } else if (e.touches.length === 1) {
      // Single finger - drawing mode
      setIsMultiTouch(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isMultiTouch) return;

    e.preventDefault(); // Prevent scrolling

    if (e.touches.length === 2) {
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      
      // Handle pinch-to-zoom
      if (initialPinchDistance > 0) {
        const scaleChange = currentDistance / initialPinchDistance;
        const newScale = Math.min(2, Math.max(0.5, canvasScale * scaleChange));
        
        // Use direct DOM manipulation to prevent flashing
        updateVisualStateWithoutRerender({ scale: newScale });
        setInitialPinchDistance(currentDistance);
      }
      
      // Handle pan
      const deltaX = currentCenter.x - panStart.x;
      const deltaY = currentCenter.y - panStart.y;
      const newPan = {
        x: canvasPan.x + deltaX * 0.5, // Dampen pan movement
        y: canvasPan.y + deltaY * 0.5
      };
      
      // Use direct DOM manipulation to prevent flashing
      updateVisualStateWithoutRerender({ pan: newPan });
      setPanStart(currentCenter);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;

    if (e.touches.length < 2) {
      setIsMultiTouch(false);
      setInitialPinchDistance(0);
      
      // Force immediate React state update when gesture ends to sync with DOM
      updateVisualStateWithoutRerender({ immediate: true });
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

  // Mobile visual update without React re-render (prevents flashing)
  const updateVisualStateWithoutRerender = useCallback((updates: {
    scale?: number;
    pan?: { x: number; y: number };
    immediate?: boolean;
  }) => {
    if (!isMobile || !canvasContainerRef.current) return;

    const container = canvasContainerRef.current;
    const canvas = container.querySelector('.react-sketch-canvas');
    
    if (canvas) {
      // Clear any pending visual update
      if (visualUpdateTimeoutRef.current) {
        clearTimeout(visualUpdateTimeoutRef.current);
      }

      // Apply immediate visual changes via CSS transform
      const transform = `scale(${updates.scale || canvasScale}) translate(${updates.pan?.x || canvasPan.x}px, ${updates.pan?.y || canvasPan.y}px)`;
      (canvas as HTMLElement).style.transform = transform;
      (canvas as HTMLElement).style.transformOrigin = 'center';

      // Only update React state after touch ends to prevent flashing
      if (!updates.immediate) {
        visualUpdateTimeoutRef.current = setTimeout(() => {
          if (updates.scale !== undefined) setCanvasScale(updates.scale);
          if (updates.pan !== undefined) setCanvasPan(updates.pan);
        }, 50);
      }
    }
  }, [isMobile, canvasScale, canvasPan]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Mobile-responsive Toolbar */}
      <div className={cn(
        "border-b bg-gray-50 border-gray-200",
        isMobile ? "p-2 space-y-2" : "p-3 flex items-center justify-between"
      )}
      style={{ 
        backgroundColor: '#f9fafb', 
        borderBottomColor: '#e5e7eb' 
      }}>
        {isMobile ? (
          // Mobile: Stacked layout for better fit
          <>
            {/* Top row: Tool selection and actions */}
            <div className="flex items-center justify-between">
              {/* Pen/Eraser toggle */}
              <div className="flex items-center gap-1 p-1 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={() => handleToolChange('pen')}
                  className={cn(
                    "h-9 w-9 p-0",
                    currentTool === 'pen' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                  )}
                  style={currentTool !== 'pen' ? { 
                    backgroundColor: 'transparent', 
                    color: '#374151'
                  } : {}}
                  onMouseEnter={(e) => {
                    if (currentTool !== 'pen') {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool !== 'pen') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Brush className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={() => handleToolChange('eraser')}
                  className={cn(
                    "h-9 w-9 p-0",
                    currentTool === 'eraser' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                  )}
                  style={currentTool !== 'eraser' ? { 
                    backgroundColor: 'transparent', 
                    color: '#374151'
                  } : {}}
                  onMouseEnter={(e) => {
                    if (currentTool !== 'eraser') {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool !== 'eraser') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>

              {/* Brush size control */}
              <div className="flex items-center gap-2 p-2 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <span className="text-xs font-medium min-w-[15px]" style={{ color: '#374151' }}>{strokeWidth}</span>
                <Slider
                  value={[strokeWidth]}
                  onValueChange={handleStrokeWidthChange}
                  max={20}
                  min={1}
                  step={1}
                  className="w-12 [&>*]:bg-gray-200 [&>*>*]:bg-blue-600 [&>*:last-child]:border-blue-600 [&>*:last-child]:bg-white"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  className="h-8 w-8 p-0"
                  style={{ backgroundColor: 'transparent', color: '#374151' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Undo className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  className="h-8 w-8 p-0"
                  style={{ backgroundColor: 'transparent', color: '#374151' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Redo className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="text-xs px-2 h-8"
                  style={{ backgroundColor: 'white', color: '#374151', borderColor: '#d1d5db' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Bottom row: Color palette (only when pen is selected) */}
            {currentTool === 'pen' && (
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-1 p-1 bg-white rounded-md border overflow-x-auto max-w-full" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={cn(
                        "w-7 h-7 rounded-sm border-2 flex-shrink-0 transition-transform",
                        strokeColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          // Desktop: Original horizontal layout
          <>
            {/* Drawing tools */}
            <div className="flex items-center gap-2">
              {/* Pen/Eraser toggle */}
              <div className="flex items-center gap-1 p-1 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('pen')}
                  className={cn(
                    "h-8 w-8 p-0",
                    currentTool === 'pen' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                  )}
                  style={currentTool !== 'pen' ? { 
                    backgroundColor: 'transparent', 
                    color: '#374151'
                  } : {}}
                  onMouseEnter={(e) => {
                    if (currentTool !== 'pen') {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool !== 'pen') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Brush className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('eraser')}
                  className={cn(
                    "h-8 w-8 p-0",
                    currentTool === 'eraser' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                  )}
                  style={currentTool !== 'eraser' ? { 
                    backgroundColor: 'transparent', 
                    color: '#374151'
                  } : {}}
                  onMouseEnter={(e) => {
                    if (currentTool !== 'eraser') {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTool !== 'eraser') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>

              {/* Color palette */}
              {currentTool === 'pen' && (
                <div className="flex items-center gap-1 p-1 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={`w-6 h-6 rounded-sm border-2 ${
                        strokeColor === color ? 'border-gray-800' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                </div>
              )}

              {/* Brush size slider */}
              <div className="flex items-center gap-2 p-2 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <span className="text-xs font-medium min-w-[20px]" style={{ color: '#374151' }}>{strokeWidth}</span>
                <Slider
                  value={[strokeWidth]}
                  onValueChange={handleStrokeWidthChange}
                  max={20}
                  min={1}
                  step={1}
                  className="w-16 [&>*]:bg-gray-200 [&>*>*]:bg-blue-600 [&>*:last-child]:border-blue-600 [&>*:last-child]:bg-white"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                className="h-8 w-8 p-0"
                style={{ backgroundColor: 'transparent', color: '#374151' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                className="h-8 w-8 p-0"
                style={{ backgroundColor: 'transparent', color: '#374151' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="text-xs"
                style={{ backgroundColor: 'white', color: '#374151', borderColor: '#d1d5db' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                Clear
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Canvas area with mobile touch support */}
      <div 
        ref={canvasContainerRef}
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: isMobile ? `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})` : 'none',
          transformOrigin: 'center',
          transition: isMultiTouch ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* Mobile gesture indicators */}
        {isMobile && canvasScale !== 1 && (
          <div className="absolute top-2 left-2 z-30 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {Math.round(canvasScale * 100)}%
          </div>
        )}
        
        {isMobile && isMultiTouch && (
          <div className="absolute top-2 right-2 z-30 bg-blue-500/70 text-white text-xs px-2 py-1 rounded">
            Two fingers: Pan & Zoom
          </div>
        )}
        
        {/* Canvas reset button for mobile */}
        {isMobile && (canvasPan.x !== 0 || canvasPan.y !== 0 || canvasScale !== 1) && (
          <Button
            onClick={() => {
              setCanvasPan({ x: 0, y: 0 });
              setCanvasScale(1);
            }}
            size="sm"
            variant="secondary"
            className="absolute bottom-2 right-2 z-30 h-8 w-auto px-2 text-xs"
          >
            Reset View
          </Button>
        )}
        
        <div
          className="whiteboard-drawing-area"
          onMouseDown={(e) => {
            // Only prevent propagation if actually starting to draw on the canvas
            const target = e.target as HTMLElement;
            if (target.tagName === 'CANVAS') {
              e.stopPropagation();
            }
          }}
        >
          <ReactSketchCanvas
            ref={canvasRef}
            style={{
              border: 'none',
              borderRadius: '0 0 8px 8px',
              cursor: currentTool === 'pen' ? 'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJtMTIgMTMgNy41LTcuNSAxLjUgMS41LTcuNSA3LjUtMS41LTEuNXoiIGZpbGw9IiMwMDAiLz48cGF0aCBkPSJtOCAxMy41IDQuNSA0LjUtNC41LTEtMC41LTAuNVYxMy41WiIgZmlsbD0iIzAwMCIvPjwvc3ZnPg==") 2 22, auto' : 'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSJ3aGl0ZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+") 12 12, auto',
              touchAction: isMobile ? 'none' : 'auto'
            }}
          width={`${whiteboard.canvas_width}px`}
          height={`${whiteboard.canvas_height - (isMobile ? 50 : 60)}px`} // Adjust for mobile toolbar
          strokeWidth={strokeWidth}
          strokeColor={currentTool === 'pen' ? strokeColor : '#FFFFFF'}
          canvasColor={whiteboard.background_color}
          onChange={handleDrawingEnd}
          allowOnlyPointerType="all" // Allow mouse, touch, and pen
          preserveBackgroundImageAspectRatio="none"
        />
        
        {/* Drawing indicator */}
        {isDrawing && !isMultiTouch && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md z-20">
            Drawing...
          </div>
        )}
        </div>
      </div>
    </div>
  );
}; 