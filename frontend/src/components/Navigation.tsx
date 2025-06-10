import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, ListChecks } from 'lucide-react';

export const Navigation: React.FC = () => {
  const location = useLocation();
  
  return (
    <div className="navigation-container my-4 mb-6">
      <nav className="flex justify-center border-b border-border pb-1">
        <div className="flex space-x-1 px-1">
          <NavLink 
            to="/canvas" 
            className={({ isActive }) => `nav-item flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive 
              ? 'bg-accent text-accent-foreground font-semibold' 
              : 'hover:bg-accent/80 hover:text-accent-foreground'}`
            }
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Canvas
          </NavLink>
          
          <NavLink 
            to="/lists" 
            className={({ isActive }) => `nav-item flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive 
              ? 'bg-accent text-accent-foreground' 
              : 'hover:bg-accent/80 hover:text-accent-foreground text-muted-foreground'}`
            }
          >
            <ListChecks className="mr-2 h-4 w-4" />
            Lists
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default Navigation;
