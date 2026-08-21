import React, { useRef, useEffect, useState } from 'react';
import { SharedItemCard } from '@/components/public/BrandedPublicPage';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import type { CanvasPath } from 'react-sketch-canvas/dist/types';
import { normalizeWhiteboardCanvasData } from '@/lib/whiteboardCanvasData';

interface SharedWhiteboardData {
  id: number;
  title: string;
  category: string;
  canvas_data: unknown;
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

const toCanvasPaths = (value: unknown): CanvasPath[] => {
  if (!Array.isArray(value)) return [];

  return value.map((pathData) => {
    if (pathData && typeof pathData === 'object') {
      const pathRecord = pathData as {
        drawMode?: boolean;
        strokeColor?: string;
        strokeWidth?: number;
        paths?: CanvasPath['paths'];
      };

      return {
        drawMode: pathRecord.drawMode ?? true,
        strokeColor: pathRecord.strokeColor || '#2563eb',
        strokeWidth: pathRecord.strokeWidth || 2,
        paths: Array.isArray(pathRecord.paths) ? pathRecord.paths : [],
      };
    }

    return {
      drawMode: true,
      strokeColor: '#2563eb',
      strokeWidth: 2,
      paths: [],
    };
  });
};

export const SharedWhiteboardCard: React.FC<SharedWhiteboardCardProps> = ({ whiteboardData, isLive = false }) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scaledCanvasHeight, setScaledCanvasHeight] = useState<number | undefined>(undefined);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);

  // Category display matching canvas logic
  const displayCategory = whiteboardData.category || 'General';
  const whiteboardColor = whiteboardData.color_value || '#2563eb';

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
    if (!isMobile || !whiteboardData.canvas_width || !whiteboardData.canvas_height) {
      setScaledCanvasHeight(undefined);
      return;
    }

    const frame = canvasFrameRef.current;
    const applyWidth = (width: number) => {
      if (width <= 0) return;
      const aspectRatio = whiteboardData.canvas_height / whiteboardData.canvas_width;
      setScaledCanvasHeight(Math.max(width * aspectRatio, 300));
    };

    applyWidth(frame?.clientWidth || 0);
    if (!frame || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      applyWidth(entries[0]?.contentRect.width || 0);
    });
    observer.observe(frame);
    return () => observer.disconnect();
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

        let dataToLoad: unknown[];
        try {
          dataToLoad = normalizeWhiteboardCanvasData(whiteboardData.canvas_data);
        } catch (error) {
          console.warn('🎨 SharedWhiteboard: Leaving canvas unchanged; canvas data is not a path array', error);
          return;
        }

        // If we have data but it's missing required metadata, reconstruct it
        if (Array.isArray(dataToLoad) && dataToLoad.length > 0) {
          const firstPath = dataToLoad[0];
          if (!firstPath || typeof firstPath !== 'object' || !('drawMode' in firstPath) || !('strokeColor' in firstPath) || !('strokeWidth' in firstPath)) {
            console.log('🎨 SharedWhiteboard: Reconstructing missing metadata for canvas paths');
            dataToLoad = toCanvasPaths(dataToLoad);
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
            canvasRef.current.loadPaths(toCanvasPaths(dataToLoad));
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
        setIsCanvasLoaded(true);
      }
    }
  }, [
    isCanvasLoaded,
    isLive,
    whiteboardData.canvas_data,
    whiteboardData.id,
    whiteboardData.title,
  ]);

  // Handle real-time updates when canvas is already loaded
  useEffect(() => {
    if (canvasRef.current && whiteboardData.canvas_data !== undefined && isCanvasLoaded && isLive) {
      try {
        console.log('🎨 SharedWhiteboard: Applying real-time update', {
          dataType: typeof whiteboardData.canvas_data,
          isArray: Array.isArray(whiteboardData.canvas_data),
          length: Array.isArray(whiteboardData.canvas_data) ? whiteboardData.canvas_data.length : 'N/A'
        });

        let dataToLoad: unknown[];
        try {
          dataToLoad = normalizeWhiteboardCanvasData(whiteboardData.canvas_data);
        } catch (error) {
          console.warn('🎨 SharedWhiteboard: Skipping realtime update; canvas data is not a path array', error);
          return;
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
            canvasRef.current.loadPaths(toCanvasPaths(dataToLoad));
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

const canvasWidth = isMobile ? '100%' : `${whiteboardData.canvas_width || 400}px`;
  const canvasHeight = isMobile ? `${scaledCanvasHeight || 300}px` : `${whiteboardData.canvas_height || 300}px`;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SharedItemCard
        title={whiteboardData.title}
        contentType="whiteboard"
        category={displayCategory}
        creatorName={whiteboardData.creator_name}
        createdAt={whiteboardData.created_at}
        isLive={isLive}
        accentColor={whiteboardColor}
      >
          <div
            ref={canvasFrameRef}
            className="relative overflow-hidden rounded-lg border border-border"
            style={{
              backgroundColor: whiteboardData.background_color || '#FFFFFF',
            }}
          >
            <div className="w-full overflow-auto">
              <ReactSketchCanvas
                ref={canvasRef}
                style={{
                  border: 'none',
                  borderRadius: '0.5rem',
                  pointerEvents: 'none', // Disable all pointer events
                  display: 'block',
                }}
                width={canvasWidth}
                height={canvasHeight}
                strokeWidth={4}
                strokeColor="#000000"
                canvasColor={whiteboardData.background_color || '#FFFFFF'}
                backgroundImage=""
                exportWithBackgroundImage={false}
                allowOnlyPointerType="none"
                withTimestamp={false}
              />
            </div>

            {/* Read-only overlay to prevent any interaction */}
            <div
              className="absolute inset-0 pointer-events-none bg-transparent"
              style={{ zIndex: 10 }}
              title="This is a read-only view of the whiteboard"
            />

            {/* Read-only indicator */}
            <div
              className="absolute right-2 top-2 rounded-md bg-foreground/80 px-2 py-1 text-xs text-background"
              style={{ zIndex: 11 }}
            >
              Read only
            </div>
          </div>
      </SharedItemCard>
    </div>
  );
};
