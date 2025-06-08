import React from 'react';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, PenLine, ListChecks, Clock } from 'lucide-react';

const Home: React.FC = () => {
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();

  // If user is already authenticated, redirect to user-home
  React.useEffect(() => {
    if (currentUser) {
      navigate('/user-home');
    }
  }, [currentUser, navigate]);

  const handleGetStarted = async () => {
    try {
      await login();
      navigate('/user-home');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute top-0 left-0 w-full h-full">
          {Array.from({ length: 10 }).map((_, i) => (
            <div 
              key={`pattern-${i}`} 
              className="absolute rounded-full bg-blue-400" 
              style={{
                width: `${Math.random() * 300 + 50}px`,
                height: `${Math.random() * 300 + 50}px`,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.2,
                transform: `scale(${Math.random() * 1 + 0.5})`,
                filter: 'blur(60px)'
              }}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="mb-6">
            <img 
              src="/cover.png" 
              alt="Itemize" 
              className="h-24 md:h-32 w-auto mx-auto"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Organize Your Life with <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Itemize</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-600 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            The simple, elegant way to create and manage lists for any purpose.
          </p>
          
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={handleGetStarted}
              className="rounded-md px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-medium text-white"
              size="lg"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            
            <Button 
              variant="outline" 
              className="rounded-md px-8 py-3 border-2 border-blue-600 text-blue-600 font-medium hover:bg-blue-50"
              size="lg"
            >
              Take a Tour
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-24 mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Everything you need to stay organized</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <ListChecks className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Create Custom Lists</h3>
              <p className="text-gray-600">
                Create different types of lists for shopping, todos, notes, or any category you need to organize.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Unlimited list categories</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Custom color coding</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <PenLine className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Stay Organized</h3>
              <p className="text-gray-600">
                Easily manage your tasks with advanced features like filtering, searching, and quick item checking.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Smart filtering options</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>One-tap task completion</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <Clock className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Access Anywhere</h3>
              <p className="text-gray-600">
                Your lists are synced and available across all your devices whenever and wherever you need them.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Real-time synchronization</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Works offline too</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Section */}
        <div className="mt-24 mb-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-10 lg:p-16 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to get organized?</h2>
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto opacity-90">
            Join thousands of users who have simplified their lives with Itemize.
          </p>
          <Button
            onClick={handleGetStarted}
            className="rounded-md px-8 py-3 bg-white text-blue-600 hover:bg-blue-50 font-medium"
            size="lg"
          >
            Start Now - It's Free
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
        
        {/* Footer */}
        <div className="mt-20 text-center text-gray-500 pt-8 border-t border-gray-200">
          <p>© {new Date().getFullYear()} Itemize. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
