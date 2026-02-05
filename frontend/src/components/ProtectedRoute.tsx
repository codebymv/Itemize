import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { PageLoading } from '@/components/ui/page-loading';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuthState();
  
  if (loading) {
    return <PageLoading className="min-h-screen" />;
  }

  if (!currentUser) {
    // Redirect to the home/landing page if not authenticated
    return <Navigate to="/home" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
