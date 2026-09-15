import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { loginReturnUrl } from '@/lib/loginReturn';
import { useAuthState } from '@/contexts/AuthContext';
import { PageLoading } from '@/components/ui/page-loading';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuthState();
  const location = useLocation();

  if (loading) {
    return <PageLoading className="min-h-screen" />;
  }

  if (!currentUser) {
    return <Navigate to={location.pathname === '/' ? '/home' : loginReturnUrl(location.pathname + location.search + location.hash)} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
