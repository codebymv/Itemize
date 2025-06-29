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

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
