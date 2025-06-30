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
}

export const SharedWhiteboardCard: React.FC<SharedWhiteboardCardProps> = ({ whiteboardData }) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scaledCanvasHeight, setScaledCanvasHeight] = useState<number | undefined>(undefined);

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

  // Load canvas data when component mounts
  useEffect(() => {
    if (canvasRef.current && whiteboardData.canvas_data) {
      try {
        canvasRef.current.loadPaths(whiteboardData.canvas_data);
      } catch (error) {
        console.warn('Failed to load canvas data:', error);
      }
    }
  }, [whiteboardData.canvas_data]);

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
              }}
              width={canvasWidth}
              height={canvasHeight}
              strokeWidth={4}
              strokeColor="#000000"
              canvasColor={whiteboardData.background_color || '#FFFFFF'}
              backgroundImage=""
              exportWithBackgroundImage={false}
              allowOnlyPointerType="all"
              withTimestamp={false}
              readOnly={true} // Make canvas read-only
            />
            
            {/* Read-only overlay to prevent any interaction */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 10 }}
            />
          </div>

          {/* Canvas info */}
          <div className="mt-3 text-center">
            <p 
              className="text-xs text-gray-500 dark:text-gray-400"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {whiteboardData.canvas_width} × {whiteboardData.canvas_height} pixels
            </p>
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
