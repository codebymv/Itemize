import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';

// Higher-order component to protect routes that require authentication
export const withAuth = <P extends object>(Component: React.ComponentType<P>) => {
  return (props: P) => {
    const { currentUser, loading, isAuthenticated } = useAuthState();
    
    // Show loading indicator while checking auth status
    if (loading) {
      return <div>Loading...</div>;
    }
    
    // Redirect to login if not authenticated
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }
    
    // User is authenticated, render the protected component
    return <Component {...props} />;
  };
};

export default withAuth;
