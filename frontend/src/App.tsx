// Import API interceptor first to ensure it's initialized before any API calls
import "@/lib/api";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { AISuggestProvider } from "@/context/AISuggestContext";
import Navbar from "@/components/Navbar";
import Home from "./pages/Home";
import UserHome from "./pages/UserHome";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Root redirect component to handle initial routing based on auth state
const RootRedirect = () => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  return currentUser ? <Navigate to="/lists" replace /> : <Navigate to="/home" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <AISuggestProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navbar />
            <main>
              <Routes>
                {/* Root path redirects based on authentication */}
                <Route path="/" element={<RootRedirect />} />
                
                {/* Public routes */}
                <Route path="/home" element={<Home />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                
                {/* Protected routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/lists" element={<UserHome />} />
                  {/* Add other protected routes here */}
                </Route>
                
                {/* Catch-all route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
          </AISuggestProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
