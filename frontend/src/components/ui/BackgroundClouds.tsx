import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import FallingClouds3D from './FallingClouds3D';

interface BackgroundCloudsProps {
  cloudCount?: number;
  className?: string;
}

const BackgroundClouds: React.FC<BackgroundCloudsProps> = ({
  cloudCount = 4,
  className,
}) => {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Defer the heavy 3D canvas calculation so it doesn't block the first DOM paint
    let rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        setIsMounted(true);
      });
    });
    // Detect if device is mobile/tablet
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent || '';
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth <= 1024; // Disable on screens 1024px and below
      return isMobileDevice || isSmallScreen;
    };

    const handleResize = () => {
      const mobile = checkIfMobile();
      setIsMobile(mobile);

      // Only update dimensions if not mobile to prevent jarring resets
      if (!mobile) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);



  // Prevent rendering entirely if on mobile, or if the main thread hasn't finished its first pass
  if (isMobile || !isMounted) return null;

  return (
    <div
      className={cn(
        'fixed pointer-events-none z-0 overflow-hidden opacity-[0.12] dark:opacity-[0.08]',
        className,
      )}
      style={{
        top: '80px', // Start below navbar (adjust based on your navbar height)
        left: 0,
        right: 0,
        bottom: '0', // End at the bottom of the viewport
      }}
    >
      <FallingClouds3D
        width={dimensions.width}
        height={dimensions.height - 80} // Subtract navbar height
        cloudCount={cloudCount}
      />
    </div>
  );
};

export default React.memo(BackgroundClouds);
