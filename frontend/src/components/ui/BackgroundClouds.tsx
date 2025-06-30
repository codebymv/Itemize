import React, { useState, useEffect } from 'react';
import FallingClouds3D from './FallingClouds3D';

interface BackgroundCloudsProps {
  opacity?: number;
  cloudCount?: number;
  isLight?: boolean;
}

const BackgroundClouds: React.FC<BackgroundCloudsProps> = ({
  opacity = 0.05,
  cloudCount = 4,
  isLight = false
}) => {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
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
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Don't render clouds on mobile devices
  if (isMobile) {
    return null;
  }

  return (
    <div
      className="fixed pointer-events-none z-0"
      style={{
        opacity,
        top: '80px', // Start below navbar (adjust based on your navbar height)
        left: 0,
        right: 0,
        bottom: '150px', // End above footer with more margin
        overflow: 'hidden' // Clip any content that goes outside
      }}
    >
      <FallingClouds3D
        width={dimensions.width}
        height={dimensions.height - 230} // Subtract navbar + footer height with more margin
        cloudCount={cloudCount}
        isLightTheme={isLight}
      />
    </div>
  );
};

export default BackgroundClouds;
