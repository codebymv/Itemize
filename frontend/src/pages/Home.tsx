import React from 'react';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, PenLine, ListChecks, Clock, Sparkles, Layers, StickyNote, ChevronDown } from 'lucide-react';

const Home: React.FC = () => {
  const { login, currentUser, isAuthenticated, token } = useAuth();
  const navigate = useNavigate();
  const navigatedRef = React.useRef(false);

  console.log('Home component rendered:', { 
    hasUser: !!currentUser, 
    hasToken: !!token,
    isAuthenticated, 
    alreadyNavigated: navigatedRef.current 
  });

  // If user is already authenticated, redirect to canvas
  React.useEffect(() => {
    if (isAuthenticated && !navigatedRef.current) {
      console.log('Navigating to /canvas due to authenticated user:', { user: currentUser, token });
      navigatedRef.current = true;
      // Ensure the navigation happens in the next tick to allow React to complete rendering
      setTimeout(() => navigate('/canvas'), 0);
    }
  }, [currentUser, navigate, isAuthenticated, token]);

  const handleGetStarted = async () => {
    try {
      console.log('Starting login process');
      navigatedRef.current = false; // Reset navigation flag
      await login();
      console.log('Login process completed, will navigate to /canvas after auth context updates');
      
      // The useEffect will handle navigation once auth state is updated
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
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="mb-2">
            <img 
              src="/icon.png" 
              alt="Itemize" 
              className="h-20 md:h-24 w-auto mx-auto"
            />
          </div>
          <h1 className="text-4xl font-light italic tracking-tight text-gray-900 sm:text-5xl md:text-6xl" style={{ fontFamily: '"Raleway", sans-serif' }}>
            {/* Mobile layout (stack text and image) */}
            <div className="flex flex-col items-center md:hidden gap-1 pb-2">
              <div className="text-center w-full">
                <div className="text-2xl md:text-xl inline-block whitespace-nowrap font-light">
                  Organize your life with
                </div>
              </div>
              <div className="mt-1">
                <div className="text-2xl md:text-2xl font-light italic tracking-wide text-gray-600">
                  ITEMIZE
                </div>
              </div>
            </div>
            
            {/* Desktop layout (text and image in row) */}
            <div className="hidden md:flex flex-row items-center justify-center gap-3">
              <span>Organize your life</span>
              <span>with</span>
              <img src="/profile.png" alt="Itemize" className="h-64 inline-block" />
            </div>
          </h1>
          <p className="mt-2 max-w-md mx-auto text-base text-gray-600 sm:text-lg md:mt-3 md:text-xl md:max-w-3xl" style={{ fontFamily: '"Raleway", sans-serif' }}>
            The complete organizational ecosystem with lists, notes, and intelligent tools to streamline your workflow.
          </p>
          
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={handleGetStarted}
              className="rounded-md px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-light text-white"
              size="lg"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-16 mb-12">
          <h2 className="text-3xl font-light italic text-center text-gray-900 mb-8" style={{ fontFamily: '"Raleway", sans-serif' }}>Everything you need to stay organized</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <Layers className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3" style={{ fontFamily: '"Raleway", sans-serif' }}>Organizational Tools</h3>
              <p className="text-gray-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Create and manage lists, notes, and any organizational content you need. From shopping lists to project notes, everything in one place.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Lists & Notes ecosystem</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Unlimited categories & colors</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <Sparkles className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3" style={{ fontFamily: '"Raleway", sans-serif' }}>Smart Suggestions</h3>
              <p className="text-gray-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Let AI help you build lists faster with intelligent item suggestions and effortless autocomplete.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>AI-powered item suggestions</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Effortless autocomplete</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 transform transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                <Clock className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3" style={{ fontFamily: '"Raleway", sans-serif' }}>Access Anywhere</h3>
              <p className="text-gray-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Your organizational tools are synced and available across all your devices whenever and wherever you need them.
              </p>
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Real-time synchronization</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Works offline too</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Section - Replacing the blue CTA */}
        <div className="mt-16 mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-light italic text-gray-900 mb-4" style={{ fontFamily: '"Raleway", sans-serif' }}>See it in action</h2>
            {/* <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Get a preview of how Itemize helps you stay organized with real interface components.
            </p> */}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
            {/* Mock List Component */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="p-4 pb-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className="inline-block w-3 h-3 rounded-full border border-gray-400"
                      style={{ backgroundColor: '#4F46E5' }}
                    />
                    <h3 className="text-lg font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>Itemize Features</h3>
                  </div>
                  <div className="flex items-center">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                    <button className="ml-2 p-1">
                      <div className="h-4 w-4 flex flex-col justify-center items-center">
                        <div className="w-1 h-1 bg-gray-400 rounded-full mb-0.5"></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full mb-0.5"></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-2 px-6">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-700 cursor-pointer" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Productivity
                </div>
              </div>

              {/* Progress Bar */}
              <div className="px-6 py-2">
                <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width: '75%', backgroundColor: '#4F46E5' }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  6 of 8 completed
                </div>
              </div>
              
              {/* List Items */}
              <div className="px-6 py-2 space-y-0.5">
                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div 
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className="line-through text-gray-400" style={{ fontFamily: '"Raleway", sans-serif' }}>Custom color coding</span>
                  </div>
                </div>
                
                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div 
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className="line-through text-gray-400" style={{ fontFamily: '"Raleway", sans-serif' }}>Cloud synchronization</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div 
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className="line-through text-gray-400" style={{ fontFamily: '"Raleway", sans-serif' }}>Category assignment</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div 
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className="line-through text-gray-400" style={{ fontFamily: '"Raleway", sans-serif' }}>Real-time collaboration</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div 
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#4F46E5', borderColor: '#4F46E5' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className="line-through text-gray-400" style={{ fontFamily: '"Raleway", sans-serif' }}>Drag & drop reordering</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0 border-gray-300">
                    </div>
                    <span style={{ fontFamily: '"Raleway", sans-serif' }}>AI-powered suggestions</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0 border-gray-300">
                    </div>
                    <span style={{ fontFamily: '"Raleway", sans-serif' }}>Cross-device access</span>
                  </div>
                </div>
              </div>

              {/* Add Item Section */}
              <div className="px-6 py-4 border-t border-gray-100">
                <div className="flex items-center space-x-2 text-gray-400">
                  <PenLine className="h-4 w-4" />
                  <span className="text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>Add new item...</span>
                  <div className="ml-auto">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Mock Note Component */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
              {/* Note Header */}
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="inline-block w-3 h-3 rounded-full border border-gray-400"
                      style={{ backgroundColor: '#F59E0B' }}
                    />
                    <h3 className="font-semibold" style={{ fontFamily: '"Raleway", sans-serif' }}>Why Choose Itemize?</h3>
                  </div>
                  <div className="flex items-center">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                    <button className="ml-2 p-1">
                      <div className="h-4 w-4 flex flex-col justify-center items-center">
                        <div className="w-1 h-1 bg-gray-400 rounded-full mb-0.5"></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full mb-0.5"></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-2 px-6">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-700 cursor-pointer" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Marketing
                </div>
              </div>

              {/* Note Content Area */}
              <div className="flex-1 mx-6 mb-6 mt-4">
                <div 
                  className="bg-white rounded-lg p-3 h-full flex flex-col"
                >
                  <div className="text-sm text-gray-700 flex-1" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    <div className="space-y-3">
                      <p>Why choose Itemize for your organizational needs?</p>
                      
                      <p>Itemize offers a complete organizational ecosystem that combines the simplicity of lists with the flexibility of notes. Whether you're planning your daily tasks or brainstorming your next big project, our platform adapts to your workflow.</p>
                      
                      <p>Key benefits include custom color coding for visual organization, real-time cloud synchronization across all your devices, intelligent AI suggestions to boost productivity, and seamless category management to keep everything organized.</p>
                      
                      <p>Join thousands of users who have transformed their productivity with Itemize's intuitive dual approach to organization.</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                          Last edited: Just now
                        </div>
                        <div title="AI-powered suggestions">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        </div>
                      </div>
                    </div>
                  </div>


                </div>
              </div>
            </div>
          </div>

          {/* CTA below the preview */}
          <div className="text-center mt-8">
          <Button
            onClick={handleGetStarted}
              className="rounded-md px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-light text-white text-lg"
            size="lg"
          >
              Start Organizing Today
              <ArrowRight className="ml-2 h-6 w-6" />
          </Button>
            {/* <p className="mt-4 text-sm text-gray-500">
              Join thousands of users who have simplified their lives with Itemize.
            </p> */}
          </div>
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
