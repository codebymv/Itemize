// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { AISuggestProvider } from "@/context/AISuggestContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Home from "./pages/Home";
import UserHome from "./pages/UserHome";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import DocsPage from "./pages/DocsPage";
import StatusPage from "./pages/StatusPage";

import ProtectedRoute from "@/components/ProtectedRoute";
import CanvasPage from "./pages/canvas";

const queryClient = new QueryClient();
const googleClientId = "761425672348-63ncpr61i8hv48l94ljju4uloahreohs.apps.googleusercontent.com";

// Root redirect component to handle initial routing based on auth state
const RootRedirect = () => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  return currentUser ? <Navigate to="/canvas" replace /> : <Navigate to="/home" replace />;
};

const AppContent = () => {
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Disable browser scroll restoration to prevent interference with manual scroll control
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      const originalScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';

      return () => {
        history.scrollRestoration = originalScrollRestoration;
      };
    }
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const isCanvasPage = location.pathname === '/canvas';
  const showFooter = !isCanvasPage || !isDesktop;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          {/* Root path redirects based on authentication */}
          <Route path="/" element={<RootRedirect />} />
          
          {/* Public routes */}
          <Route path="/home" element={<Home />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/help/*" element={<DocsPage />} />
          <Route path="/status" element={<StatusPage />} />
          
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/lists" element={<UserHome />} />
            <Route path="/canvas" element={<CanvasPage />} />
            {/* Add other protected routes here */}
          </Route>
          
          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {showFooter && <Footer />}
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        themes={['light', 'dark']}
      >
        <GoogleOAuthProvider clientId={googleClientId}>
          <AuthProvider>
            <AISuggestProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true
                }}
              >
                <AppContent />
              </BrowserRouter>
            </AISuggestProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
