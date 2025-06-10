import React from 'react';
import Navbar from './Navbar';
import Navigation from './Navigation';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      {/* Only show navigation when user is authenticated */}
      {currentUser && <Navigation />}
      
      <main className="flex-grow">
        {children}
      </main>
      
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Itemize. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Layout;
