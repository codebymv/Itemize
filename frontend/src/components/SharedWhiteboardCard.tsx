import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Palette } from 'lucide-react';

interface SharedWhiteboardData {
  id: number;
  title: string;
  category: string;
  canvas_data: any;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'whiteboard';
}

interface SharedWhiteboardCardProps {
  whiteboardData: SharedWhiteboardData;
  isLive?: boolean;
}

export const SharedWhiteboardCard: React.FC<SharedWhiteboardCardProps> = ({ whiteboardData, isLive = false }) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scaledCanvasHeight, setScaledCanvasHeight] = useState<number | undefined>(undefined);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate scaled canvas dimensions for mobile
  useEffect(() => {
    if (isMobile && whiteboardData.canvas_width && whiteboardData.canvas_height) {
      const containerWidth = 320; // Approximate mobile container width
      const aspectRatio = whiteboardData.canvas_height / whiteboardData.canvas_width;
      const scaledHeight = Math.max(containerWidth * aspectRatio, 300); // Minimum height
      setScaledCanvasHeight(scaledHeight);
    } else {
      setScaledCanvasHeight(undefined);
    }
  }, [isMobile, whiteboardData.canvas_width, whiteboardData.canvas_height]);

  // Load canvas data when component mounts or when canvas data changes (for real-time updates)
  useEffect(() => {
    if (canvasRef.current && whiteboardData.canvas_data !== undefined && !isCanvasLoaded) {
      try {
        console.log('🎨 SharedWhiteboard: Loading canvas data:', {
          dataType: typeof whiteboardData.canvas_data,
          isArray: Array.isArray(whiteboardData.canvas_data),
          dataLength: Array.isArray(whiteboardData.canvas_data) ? whiteboardData.canvas_data.length : 'N/A',
          dataPreview: typeof whiteboardData.canvas_data === 'string' ? whiteboardData.canvas_data.substring(0, 300) : JSON.stringify(whiteboardData.canvas_data).substring(0, 300),
          rawData: whiteboardData.canvas_data,
          whiteboardId: whiteboardData.id,
          whiteboardTitle: whiteboardData.title
        });

        // Validate canvas data format - should be an array of CanvasPath objects
        let dataToLoad = whiteboardData.canvas_data;

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
            console.warn('🎨 SharedWhiteboard: Failed to parse string canvas data:', e);
            dataToLoad = [];
          }
        } else if (dataToLoad && typeof dataToLoad === 'object' && dataToLoad.paths) {
          // Object format with paths property from backend
          console.log('🎨 SharedWhiteboard: Data is in object format with paths, extracting array');
          dataToLoad = dataToLoad.paths;
        } else if (!Array.isArray(dataToLoad)) {
          console.warn('🎨 SharedWhiteboard: Unknown data format or not an array, using empty array');
          dataToLoad = [];
        }

        // Ensure dataToLoad is an array before proceeding
        if (!Array.isArray(dataToLoad)) {
          console.warn('🎨 SharedWhiteboard: Data is not an array after processing, forcing empty array:', typeof dataToLoad);
          dataToLoad = [];
        }

        // If we have data but it's missing required metadata, reconstruct it
        if (dataToLoad.length > 0) {
          const firstPath = dataToLoad[0];
          if (!firstPath.drawMode || !firstPath.strokeColor || !firstPath.strokeWidth) {
            console.log('🎨 SharedWhiteboard: Reconstructing missing metadata for canvas paths');
            dataToLoad = dataToLoad.map((pathData: any, index: number) => ({
              drawMode: true,
              strokeColor: pathData.strokeColor || '#2563eb', // Default to theme blue
              strokeWidth: pathData.strokeWidth || 2,
              paths: pathData.paths || pathData || []
            }));
          }
        }

        console.log('🎨 SharedWhiteboard: Final data to load:', {
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

          // Handle empty arrays (cleared canvas) explicitly
          if (dataToLoad.length === 0) {
            console.log('🎨 SharedWhiteboard: Loading empty canvas (cleared)');
            canvasRef.current.clearCanvas();
            setTimeout(() => {
              canvasRef.current.loadPaths([]);
              setIsCanvasLoaded(true);
            }, 50);
          } else {
            console.log(`🎨 SharedWhiteboard: Loading ${dataToLoad.length} paths`);
            canvasRef.current.loadPaths(dataToLoad);
            setIsCanvasLoaded(true);
          }

          console.log('🎨 SharedWhiteboard: Canvas data loaded successfully');

          // Restore original console methods
          console.warn = originalWarn;
          console.error = originalError;
        } else {
          console.warn('🎨 SharedWhiteboard: Invalid canvas data format, using empty canvas:', {
            dataType: typeof dataToLoad,
            dataValue: dataToLoad
          });
          canvasRef.current.loadPaths([]);
          setIsCanvasLoaded(true);
        }

        if (isLive) {
          console.log('🎨 SharedWhiteboard: Real-time canvas update applied');
        }
      } catch (error) {
        console.error('🎨 SharedWhiteboard: Failed to load canvas data:', error);
        // Load empty canvas on error
        try {
          canvasRef.current.loadPaths([]);
          setIsCanvasLoaded(true);
        } catch (fallbackError) {
          console.error('🎨 SharedWhiteboard: Failed to load empty canvas:', fallbackError);
        }
      }
    }
  }, [whiteboardData.canvas_data, isCanvasLoaded]);

  // Handle real-time updates when canvas is already loaded
  useEffect(() => {
    if (canvasRef.current && whiteboardData.canvas_data !== undefined && isCanvasLoaded && isLive) {
      try {
        console.log('🎨 SharedWhiteboard: Applying real-time update', {
          dataType: typeof whiteboardData.canvas_data,
          isArray: Array.isArray(whiteboardData.canvas_data),
          length: Array.isArray(whiteboardData.canvas_data) ? whiteboardData.canvas_data.length : 'N/A'
        });

        // Parse and load the updated canvas data
        let dataToLoad = whiteboardData.canvas_data;

        if (typeof dataToLoad === 'string') {
          const parsed = JSON.parse(dataToLoad);
          dataToLoad = Array.isArray(parsed) ? parsed : (parsed.paths || []);
        } else if (dataToLoad && typeof dataToLoad === 'object' && dataToLoad.paths) {
          dataToLoad = dataToLoad.paths;
        } else if (!Array.isArray(dataToLoad)) {
          dataToLoad = [];
        }

        // Always load paths, even if empty (for clearing)
        if (Array.isArray(dataToLoad)) {
          console.log(`🎨 SharedWhiteboard: Loading ${dataToLoad.length} paths (${dataToLoad.length === 0 ? 'CLEARING CANVAS' : 'UPDATING CANVAS'})`);

          // If empty array, explicitly clear the canvas first
          if (dataToLoad.length === 0) {
            console.log('🎨 SharedWhiteboard: Explicitly clearing canvas before loading empty paths');
            canvasRef.current.clearCanvas();
            // Small delay to ensure clear operation completes
            setTimeout(() => {
              canvasRef.current.loadPaths([]);
            }, 50);
          } else {
            canvasRef.current.loadPaths(dataToLoad);
          }

          console.log('🎨 SharedWhiteboard: Real-time update applied successfully');
        }
      } catch (error) {
        console.error('🎨 SharedWhiteboard: Failed to apply real-time update:', error);
      }
    }
  }, [whiteboardData.canvas_data, isCanvasLoaded, isLive]);

  // Reset canvas loaded state when whiteboard ID changes (new whiteboard)
  useEffect(() => {
    setIsCanvasLoaded(false);
  }, [whiteboardData.id]);

  const canvasWidth = isMobile ? '100%' : (whiteboardData.canvas_width || 400);
  const canvasHeight = isMobile ? scaledCanvasHeight || 300 : (whiteboardData.canvas_height || 300);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card 
        className="w-full shadow-lg border-2 transition-all duration-200"
        style={{ 
          borderColor: whiteboardData.color_value,
          '--whiteboard-color': whiteboardData.color_value 
        } as React.CSSProperties}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-gray-600" />
            <div className="flex-1">
              <h3 
                className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {whiteboardData.title}
              </h3>
              {whiteboardData.category && (
                <p 
                  className="text-sm text-gray-500 dark:text-gray-400"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {whiteboardData.category}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Canvas Content */}
        <CardContent className="p-4">
          <div 
            className="relative border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            style={{ 
              backgroundColor: whiteboardData.background_color || '#FFFFFF',
              width: '100%',
              maxWidth: isMobile ? '100%' : `${whiteboardData.canvas_width || 400}px`
            }}
          >
            <ReactSketchCanvas
              ref={canvasRef}
              style={{
                border: 'none',
                borderRadius: '0.5rem',
                pointerEvents: 'none', // Disable all pointer events
              }}
              width={canvasWidth}
              height={canvasHeight}
              strokeWidth={4}
              strokeColor="#000000"
              canvasColor={whiteboardData.background_color || '#FFFFFF'}
              backgroundImage=""
              exportWithBackgroundImage={false}
              allowOnlyPointerType="none" // Disable all pointer types
              withTimestamp={false}
              readOnly={true} // Make canvas read-only
            />

            {/* Read-only overlay to prevent any interaction */}
            <div
              className="absolute inset-0 pointer-events-none bg-transparent"
              style={{ zIndex: 10 }}
              title="This is a read-only view of the whiteboard"
            />

            {/* Read-only indicator */}
            <div
              className="absolute top-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded-md opacity-75"
              style={{ zIndex: 11 }}
            >
              Read Only
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Creator Attribution */}
      <div className="mt-4 text-center">
        <p 
          className="text-sm text-gray-500 dark:text-gray-400"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          Created by <span className="font-medium">{whiteboardData.creator_name}</span> on{' '}
          {new Date(whiteboardData.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
