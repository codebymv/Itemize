import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { currentUser, loading, isAuthenticated } = useAuth();
  
  console.log('ProtectedRoute evaluation:', { 
    hasUser: !!currentUser, 
    loading,
    isAuthenticated,
    userData: currentUser
  });
  
  if (loading) {
    console.log('Protected route loading state');
    // You could render a loading spinner here
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>;
  }

  if (!currentUser) {
    console.log('Protected route redirect - not authenticated');
    // Redirect to the home/landing page if not authenticated
    return <Navigate to="/home" replace />;
  }

  console.log('Protected route rendering content');
  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
