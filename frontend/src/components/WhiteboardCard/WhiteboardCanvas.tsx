import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Palette, Eraser, Brush, Undo, Redo, Sparkles, X } from 'lucide-react';
import { formatRelativeTime } from '../../utils/timeUtils';
import { useToast } from '@/hooks/use-toast';
import { Whiteboard } from '@/types';
import { cn } from '@/lib/utils';
import { debounce } from 'lodash';

interface WhiteboardCanvasProps {
  whiteboard: Whiteboard;
  onCanvasChange: (canvasData: any) => void;
  onSave: (data: { canvas_data: any; updated_at: string }) => void;
  whiteboardColor: string;
  onAutoSave: (canvasData: any) => Promise<void>;
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

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  whiteboard,
  onCanvasChange,
  onSave,
  whiteboardColor,
  onAutoSave,
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

  // Dynamic canvas sizing - track actual container dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: whiteboard.canvas_width || 500,
    height: whiteboard.canvas_height || 500
  });

  // References for direct DOM manipulation to prevent flashing
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  

  // Load existing canvas data on mount
  useEffect(() => {
    if (canvasRef.current && whiteboard.canvas_data && !isCanvasLoaded) {
      try {
        console.log('🎨 Loading canvas data:', {
          dataType: typeof whiteboard.canvas_data,
          isArray: Array.isArray(whiteboard.canvas_data),
          dataLength: Array.isArray(whiteboard.canvas_data) ? whiteboard.canvas_data.length : 'N/A',
          dataPreview: typeof whiteboard.canvas_data === 'string' ? whiteboard.canvas_data.substring(0, 300) : JSON.stringify(whiteboard.canvas_data).substring(0, 300)
        });
        
        // Validate canvas data format - should be an array of CanvasPath objects
        let dataToLoad = whiteboard.canvas_data;
        
        // Handle different data formats from database
        if (typeof dataToLoad === 'string') {
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
            console.warn('🎨 Corrupted data preview:', (dataToLoad as string)?.substring?.(0, 200) || 'N/A');
            dataToLoad = [];
            
            
          }
        } else if (dataToLoad && typeof dataToLoad === 'object' && dataToLoad.paths) {
          // Object format with paths property from backend
          console.log('🎨 Data is in object format with paths, extracting array');
          dataToLoad = dataToLoad.paths;
        } else if (!Array.isArray(dataToLoad)) {
          console.warn('🎨 Unknown data format or not an array, using empty array');
          dataToLoad = [];
        }

        // Ensure dataToLoad is an array before proceeding
        if (!Array.isArray(dataToLoad)) {
          console.warn('🎨 Data is not an array after processing, forcing empty array:', typeof dataToLoad);
          dataToLoad = [];
        }

        // Additional validation: ensure the array can be JSON serialized
        try {
          const testSerialization = JSON.stringify(dataToLoad);
          JSON.parse(testSerialization);
        } catch (jsonError) {
          console.error('🎨 Canvas data fails JSON validation, using empty array:', jsonError);
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
          
          // Auto-fix corrupted data
          console.log('🎨 Auto-fixing corrupted canvas data after load error...');
          try {
            onSave([]);
          } catch (saveError) {
            console.error('🎨 Failed to auto-fix corrupted data:', saveError);
          }
        } catch (fallbackError) {
          console.error('🎨 Failed to load empty canvas:', fallbackError);
        }
      }
    }
  }, [whiteboard.canvas_data, isCanvasLoaded, autoSaveTimeout]);

  // Calculate content scale for mobile responsiveness
  useEffect(() => {
    if (isMobile && canvasContainerRef.current) {
      const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
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
  }, [isMobile, whiteboard.canvas_width]);

  // Dynamic canvas sizing - measure container and adjust canvas dimensions
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          console.log('🎨 Container dimensions changed:', { width, height });
          // Inner container already accounts for footer space via paddingBottom
          setCanvasDimensions({
            width: Math.floor(width),
            height: Math.floor(height)
          });
        }
      }
    });

    observer.observe(canvasContainerRef.current);
    
    // Also trigger immediate measurement in case ResizeObserver doesn't fire right away
    const rect = canvasContainerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log('🎨 Initial container dimensions:', { width: rect.width, height: rect.height });
      // Inner container already accounts for footer space via paddingBottom
      setCanvasDimensions({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height)
      });
    }
    
    return () => observer.disconnect();
  }, [updatedAt]);

  // Debug canvas dimensions changes
  useEffect(() => {
    console.log('🎨 Canvas dimensions updated:', canvasDimensions);
  }, [canvasDimensions]);

  // Debounced auto-save function (reduced delay for faster saves)
  const debouncedAutoSave = useCallback(
    debounce(async (canvasData: any[], whiteboardId: number) => {
      try {
        // Validate canvas data before saving
        if (!Array.isArray(canvasData)) {
          console.warn('🎨 Invalid canvas data format - not an array:', typeof canvasData);
          return;
        }

        // Test JSON serialization to catch malformed data early
        const testSerialization = JSON.stringify(canvasData);
        JSON.parse(testSerialization); // This will throw if the JSON is malformed
        
        console.log('🎨 Auto-saving canvas data:', {
          pathCount: canvasData.length,
          dataPreview: testSerialization.substring(0, 100),
          whiteboardId
        });
        await onSave({ canvas_data: canvasData, updated_at: new Date().toISOString() });
        console.log('🎨 Canvas auto-save completed successfully');
      } catch (error) {
        console.error('🎨 Canvas auto-save failed:', error);
        
        // If it's a JSON serialization error, show a user-friendly message
        if (error instanceof Error && (error.message.includes('JSON') || error.message.includes('stringify'))) {
          console.error('🎨 Canvas data is corrupted and cannot be saved. This may be due to a drawing library error.');
        }
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
    console.log('🎨 handleDrawingEnd called.');
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
      console.log('🎨 WhiteboardCanvas: Raw exported paths:', currentCanvasData);
      
      // Validate canvas data before processing
      if (!Array.isArray(currentCanvasData)) {
        console.warn('🎨 Invalid canvas data format from exportPaths - not an array:', typeof currentCanvasData);
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
      
      console.log('🎨 Canvas change detection:', {
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
        await onSave({ canvas_data: [], updated_at: new Date().toISOString() });
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

  // Mobile touch event handlers - enhanced for proper multi-touch detection
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;

    console.log(`Touch start: ${e.touches.length} fingers`);

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
      
      console.log('Multi-touch enabled for pan/zoom');
    } else if (e.touches.length === 1) {
      // Single finger - allow drawing mode only if not coming from multi-touch
      if (!isMultiTouch) {
        console.log('Single finger - drawing mode');
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
        console.log('Multi-touch enabled during move');
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

    console.log(`Touch end: ${e.touches.length} fingers remaining`);

    // Reset multi-touch when no fingers or only one finger remains
    if (e.touches.length < 2) {
      if (isMultiTouch) {
        console.log('Exiting multi-touch mode');
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
    >
      {/* Global CSS override to eliminate ReactSketchCanvas borders */}
      <style>
        {`
          .react-sketch-canvas {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            pointer-events: all !important; /* Diagnostic: Ensure canvas receives pointer events */
            z-index: 1000; /* Diagnostic: Bring canvas to front */
          }
          .react-sketch-canvas canvas {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            pointer-events: all !important; /* Diagnostic: Ensure canvas receives pointer events */
            z-index: 1000; /* Diagnostic: Bring canvas to front */
          }
          .whiteboard-drawing-area {
            pointer-events: all !important; /* Diagnostic: Ensure parent receives pointer events */
            z-index: 999; /* Diagnostic: Bring parent to front */
          }
        `}
      </style>

      {/* Toolbar - always visible */}
      <div className="flex items-center justify-between p-2 border-b" style={{ backgroundColor: '#f9fafb', borderBottomColor: '#e5e7eb' }}>
        <div className="flex flex-col gap-2 w-full">
          {/* Top Row */}
          <div className="flex items-center gap-2">
            {/* Left side: Tool, Brush Size */}
            <div className="flex-shrink-0 flex items-center gap-2">
              {/* Tool selection */}
              <div className="flex items-center gap-1 p-1 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('pen')}
                  className={cn("h-8 w-8 p-0", currentTool === 'pen' ? 'bg-blue-600 hover:bg-blue-700 text-white' : '')}
                  style={currentTool !== 'pen' ? { backgroundColor: 'transparent', color: '#374151'} : {}}
                  onMouseEnter={(e) => { if (currentTool !== 'pen') { e.currentTarget.style.backgroundColor = '#f3f4f6'; } }}
                  onMouseLeave={(e) => { if (currentTool !== 'pen') { e.currentTarget.style.backgroundColor = 'transparent'; } }}
                >
                  <Brush className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToolChange('eraser')}
                  className={cn("h-8 w-8 p-0", currentTool === 'eraser' ? 'bg-blue-600 hover:bg-blue-700 text-white' : '')}
                  style={currentTool !== 'eraser' ? { backgroundColor: 'transparent', color: '#374151'} : {}}
                  onMouseEnter={(e) => { if (currentTool !== 'eraser') { e.currentTarget.style.backgroundColor = '#f3f4f6'; } }}
                  onMouseLeave={(e) => { if (currentTool !== 'eraser') { e.currentTarget.style.backgroundColor = 'transparent'; } }}
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>
              {/* Brush size slider */}
              <div className="flex items-center gap-2 p-2 bg-white rounded-md border" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
                <span className="text-xs font-medium min-w-[20px]" style={{ color: '#374151' }}>{strokeWidth}</span>
                <Slider
                  value={[strokeWidth]}
                  onValueChange={handleStrokeWidthChange}
                  max={20}
                  min={1}
                  step={1}
                  className="w-12 sm:w-24 [&>*]:bg-gray-200 [&>*>*]:bg-blue-600 [&>*:last-child]:border-blue-600 [&>*:last-child]:bg-white"
                />
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-grow" />

            {/* Right side: Actions */}
            <div className="flex-shrink-0 flex items-center gap-1">
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
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 w-8 p-0"
                style={{ backgroundColor: 'transparent', color: '#374151' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Bottom Row (Conditional) */}
          {currentTool === 'pen' && (
            <div className="flex justify-center items-center gap-1 p-1 bg-white rounded-md border flex-wrap" style={{ backgroundColor: 'white', borderColor: '#d1d5db' }}>
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded-sm border-2 ${strokeColor === color ? 'border-gray-800' : 'border-gray-300'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select ${color} color`}
                />
              ))}
            </div>
          )}
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
            cursor: 'crosshair'
          }}
        >
          <ReactSketchCanvas
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
            onStroke={() => setIsDrawing(true)}
          />
          
          {/* Drawing indicator */}
          {isDrawing && !isMultiTouch && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md z-20">
              Drawing...
            </div>
          )}
        </div>

        {/* Footer - positioned absolutely at bottom of this container */}
        {updatedAt && (
          <div 
            className="absolute bottom-0 left-0 right-0 px-2 md:px-3 py-1 md:py-2 z-10 border-t"
            style={{ 
              borderTopColor: '#e5e7eb',
              backgroundColor: '#ffffff',
              fontSize: '10px'
            }}
          >
            <div className="flex items-center justify-between">
              <div 
                className="text-gray-500 truncate text-xs md:text-xs"
                style={{ 
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: 'inherit'
                }}
              >
                <span className="hidden sm:inline">Last edited: </span>
                <span className="sm:hidden">Edited: </span>
                {formatRelativeTime(updatedAt)}
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
    </div>
  );
}; 