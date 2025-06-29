import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { withAuth } from './hoc/withAuth';

// Import pages
import UserHome from './pages/UserHome'; // Lists page
import CanvasPage from './pages/canvas';
import Home from './pages/Home'; // Home page with login functionality
import NotFoundPage from './pages/NotFound';
import DocsPage from './pages/DocsPage';
import StatusPage from './pages/StatusPage';

// Import layout
import Layout from './components/Layout';
import { useAuth } from './contexts/AuthContext';

const AppRoutes: React.FC = () => {
  const { currentUser, loading } = useAuth();
  
  // Show loading state while auth is being determined
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Home />} />
      <Route path="/home" element={<Home />} />
      <Route path="/help" element={<DocsPage />} />
      <Route path="/status" element={<StatusPage />} />
      
      {/* Protected routes */}
      <Route path="/lists" element={withAuth(UserHome)({})} />
      <Route path="/canvas" element={withAuth(CanvasPage)({})} />
      
      {/* Redirect root to appropriate page based on auth status */}
      <Route 
        path="/" 
        element={
          <Navigate 
            to={currentUser ? "/canvas" : "/login"} 
            replace 
          />
        } 
      />
      
      {/* 404 page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
