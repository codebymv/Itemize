import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Navigation from './Navigation';
import Footer from './Footer';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const useIsDesktopCanvas = () => {
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktop && location.pathname === '/canvas';
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const hideFooter = useIsDesktopCanvas();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      {/* Only show navigation when user is authenticated */}
      {currentUser && <Navigation />}
      
      <main className="flex-grow">
        {children}
      </main>
      
      {/* Hide footer only on desktop /canvas view */}
      {!hideFooter && <Footer />}
    </div>
  );
};

export default Layout;
