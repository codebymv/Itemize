import React from 'react';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { CheckCircle, ArrowRight, Plus, CheckSquare, Clock, Sparkles, Layers, StickyNote, ChevronDown, Bold, Italic, Underline, Strikethrough, Type, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Quote, Palette, Eraser, Brush, Undo, Redo, Share } from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';

const Home: React.FC = () => {
  const { login, currentUser, isAuthenticated, token } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const navigatedRef = React.useRef(false);

  // Theme-aware styling
  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';
  const textColor = isLight ? 'text-gray-900' : 'text-slate-100';
  const secondaryTextColor = isLight ? 'text-gray-600' : 'text-slate-400';
  const cardBgColor = isLight ? 'bg-white' : 'bg-slate-800';
  const cardBorderColor = isLight ? 'border-gray-100' : 'border-slate-700';
  const patternColor = isLight ? 'bg-blue-400' : 'bg-slate-600';

  // Logo filter for theme switching (invert colors in dark mode)
  const logoFilter = isLight ? 'none' : 'invert(1) brightness(1.2)';

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
    <div className={`min-h-screen ${bgGradient} overflow-hidden relative`}>
      {/* Background Clouds */}
      <BackgroundClouds opacity={isLight ? 0.2 : 0.15} cloudCount={15} isLight={isLight} />

      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute top-0 left-0 w-full h-full">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={`pattern-${i}`}
              className={`absolute rounded-full ${patternColor}`}
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
          <h1 className={`text-4xl font-light italic tracking-tight ${textColor} sm:text-5xl md:text-6xl`} style={{ fontFamily: '"Raleway", sans-serif' }}>
            {/* Mobile layout (stack text and image) */}
            <div className="flex flex-col items-center md:hidden gap-1 pb-2">
              <div className="text-center w-full">
                <div className="text-2xl md:text-xl inline-block whitespace-nowrap font-light">
                  Organize confidently with
                </div>
              </div>
              <div className="mt-1">
                <div className={`text-2xl md:text-2xl font-light italic tracking-wide ${secondaryTextColor}`}>
                  ITEMIZE
                </div>
              </div>
            </div>

            {/* Desktop layout (text and image in row) */}
            <div className="hidden md:flex flex-row items-center justify-center gap-3">
              <span>Organize your life</span>
              <span>with</span>
              <img
                src="/profile.png"
                alt="Itemize"
                className="h-64 inline-block"
                style={{ filter: logoFilter }}
              />
            </div>
          </h1>
          <p className={`mt-2 max-w-md mx-auto text-base ${secondaryTextColor} sm:text-lg md:mt-3 md:text-xl md:max-w-3xl`} style={{ fontFamily: '"Raleway", sans-serif' }}>
            A complete organizational ecosystem with lists, notes, whiteboarding, and intelligent tools to streamline your workflow.
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
      </div>

      {/* Features Section - Wider than other sections */}
      <div className="relative z-10 mt-16 mb-12">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className={`text-3xl font-light italic text-center ${textColor} mb-8`} style={{ fontFamily: '"Raleway", sans-serif' }}>Tools to stay organized</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            <div className={`${cardBgColor} p-10 rounded-xl shadow-sm border ${cardBorderColor} transform transition-all duration-300 hover:shadow-md hover:-translate-y-1`}>
              <div className={`w-14 h-14 ${isLight ? 'bg-slate-100' : 'bg-slate-800'} rounded-full flex items-center justify-center mb-5`}>
                <Layers className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className={`text-xl font-semibold ${textColor} mb-3`} style={{ fontFamily: '"Raleway", sans-serif' }}>Organizational Tools</h3>
              <p className={secondaryTextColor} style={{ fontFamily: '"Raleway", sans-serif' }}>
                Create and manage lists, notes, and any organizational content you need. From shopping lists to project notes, everything in one place.
              </p>
              <div className={`mt-6 pt-4 border-t ${cardBorderColor}`}>
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Lists, Notes, & Whiteboards</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Easy categories & color groupings</span>
                </div>
              </div>
            </div>

            <div className={`${cardBgColor} p-10 rounded-xl shadow-sm border ${cardBorderColor} transform transition-all duration-300 hover:shadow-md hover:-translate-y-1`}>
              <div className={`w-14 h-14 ${isLight ? 'bg-slate-100' : 'bg-slate-800'} rounded-full flex items-center justify-center mb-5`}>
                <Sparkles className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className={`text-xl font-semibold ${textColor} mb-3`} style={{ fontFamily: '"Raleway", sans-serif' }}>Smart Suggestions</h3>
              <p className={secondaryTextColor} style={{ fontFamily: '"Raleway", sans-serif' }}>
                Let AI help you build lists faster with intelligent item suggestions and effortless autocomplete.
              </p>
              <div className={`mt-6 pt-4 border-t ${cardBorderColor}`}>
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>AI-powered item suggestions</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Effortless autocomplete</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Context-aware suggestions</span>
                </div>
              </div>
            </div>

            <div className={`${cardBgColor} p-10 rounded-xl shadow-sm border ${cardBorderColor} transform transition-all duration-300 hover:shadow-md hover:-translate-y-1`}>
              <div className={`w-14 h-14 ${isLight ? 'bg-slate-100' : 'bg-slate-800'} rounded-full flex items-center justify-center mb-5`}>
                <Clock className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className={`text-xl font-semibold ${textColor} mb-3`} style={{ fontFamily: '"Raleway", sans-serif' }}>Access Anywhere</h3>
              <p className={secondaryTextColor} style={{ fontFamily: '"Raleway", sans-serif' }}>
                Your organizational tools are synced and available across all your devices whenever and wherever you need them.
              </p>
              <div className={`mt-6 pt-4 border-t ${cardBorderColor}`}>
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

            <div className={`${cardBgColor} p-10 rounded-xl shadow-sm border ${cardBorderColor} transform transition-all duration-300 hover:shadow-md hover:-translate-y-1`}>
              <div className={`w-14 h-14 ${isLight ? 'bg-slate-100' : 'bg-slate-800'} rounded-full flex items-center justify-center mb-5`}>
                <Share className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className={`text-xl font-semibold ${textColor} mb-3`} style={{ fontFamily: '"Raleway", sans-serif' }}>Share Freely</h3>
              <p className={secondaryTextColor} style={{ fontFamily: '"Raleway", sans-serif' }}>
                Share your lists, notes, and whiteboards with anyone through secure, read-only links that work instantly.
              </p>
              <div className={`mt-6 pt-4 border-t ${cardBorderColor}`}>
                <div className="flex items-center text-sm text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Instant shareable links</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>Read-only public access</span>
                </div>
                <div className="flex items-center text-sm text-blue-600 mt-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span>No account required to view</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview Section - Replacing the blue CTA */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mt-16 mb-12">
          <div className="text-center mb-8">
            <h2 className={`text-3xl font-light italic ${textColor} mb-4`} style={{ fontFamily: '"Raleway", sans-serif' }}>See them in action</h2>
            {/* <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Get a preview of how Itemize helps you stay organized with real interface components.
            </p> */}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {/* Mock List Component */}
            <div className={`${cardBgColor} rounded-xl shadow-sm border ${cardBorderColor} overflow-hidden`}>
              {/* Header */}
              <div className="p-4 pb-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`inline-block w-3 h-3 rounded-full border ${isLight ? 'border-gray-400' : 'border-slate-500'}`}
                      style={{ backgroundColor: '#8B5CF6' }}
                    />
                    <CheckSquare className={`h-4 w-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                    <h3 className={`text-lg font-medium ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Features</h3>
                  </div>
                  <div className="flex items-center">
                    <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                    <button className="ml-2 p-1">
                      <div className="h-4 w-4 flex flex-col justify-center items-center">
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full`}></div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-2 px-6">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-violet-500 text-white cursor-pointer" style={{ backgroundColor: '#8B5CF6', fontFamily: '"Raleway", sans-serif' }}>
                  Productivity
                </div>
              </div>

              {/* Progress Bar */}
              <div className="px-6 py-2">
                <div className={`w-full ${isLight ? 'bg-gray-100' : 'bg-slate-700'} rounded-full h-2 mb-1`}>
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width: '100%', backgroundColor: '#8B5CF6' }}
                  ></div>
                </div>
                <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                  9 of 9 completed
                </div>
              </div>
              
              {/* List Items */}
              <div className="px-6 py-2 space-y-0.5">
                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={`line-through ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Custom color coding</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={`line-through ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Cloud synchronization</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={`line-through ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Category assignment</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={`line-through ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Real-time collaboration</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div
                      className="w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                    >
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={`line-through ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Drag & drop reordering</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}>
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={textColor} style={{ fontFamily: '"Raleway", sans-serif' }}>Privacy control</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}>
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={textColor} style={{ fontFamily: '"Raleway", sans-serif' }}>Shareable content</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}>
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={textColor} style={{ fontFamily: '"Raleway", sans-serif' }}>AI-powered suggestions</span>
                  </div>
                </div>

                <div className="flex items-center py-1 group">
                  <div className="flex items-center flex-grow">
                    <div className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}>
                    <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                    <span className={textColor} style={{ fontFamily: '"Raleway", sans-serif' }}>Cross-device access</span>
                  </div>
                </div>
              </div>

              {/* Add Item Section */}
              <div className={`p-2 border-t ${cardBorderColor}`}>
                <div className="flex items-center gap-2">
                  <div className={`relative flex-1 rounded-md border ${isLight ? 'border-gray-300' : 'border-slate-600'}`}>
                    <div className={`h-8 px-3 flex items-center ${isLight ? 'bg-white' : 'bg-slate-700'} rounded-md`}>
                      <span className={`text-sm ${isLight ? 'text-gray-400' : 'text-slate-500'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Add new item...</span>
                      <div className="absolute right-2">
                        <Sparkles className="h-4 w-4" style={{ color: '#8B5CF6' }} />
                      </div>
                    </div>
                  </div>

                  <button className={`h-8 w-8 rounded-md flex items-center justify-center ${isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-slate-600 hover:bg-slate-500'} transition-colors`}>
                    <Plus className="h-4 w-4" />
                  </button>

                  <button className={`h-8 w-8 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors`}>
                    <span className="text-lg leading-none">×</span>
                  </button>
                </div>

                {/* AI Suggestion */}
                <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                  <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                  <span className="text-sm font-medium" style={{ color: '#8B5CF6', fontFamily: '"Raleway", sans-serif' }}>Suggest:</span>
                  <span className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: '#8B5CF6', fontFamily: '"Raleway", sans-serif' }}>
                    Powerful Canvas
                  </span>
                </div>
              </div>
            </div>

            {/* Mock Note Component */}
            <div className={`${cardBgColor} rounded-xl shadow-sm border ${cardBorderColor} overflow-hidden h-full flex flex-col`}>
              {/* Note Header */}
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`inline-block w-3 h-3 rounded-full border ${isLight ? 'border-gray-400' : 'border-slate-500'}`}
                      style={{ backgroundColor: '#06B6D4' }}
                    />
                    <StickyNote className={`h-4 w-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                    <h3 className={`font-semibold ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Combined Approach</h3>
                  </div>
                  <div className="flex items-center">
                    <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                    <button className="ml-2 p-1">
                      <div className="h-4 w-4 flex flex-col justify-center items-center">
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full`}></div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-2 px-6">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-cyan-500 text-white cursor-pointer" style={{ backgroundColor: '#06B6D4', fontFamily: '"Raleway", sans-serif' }}>
                  Strategy
                </div>
              </div>

              {/* Rich Text Toolbar Demo */}
              <div className="mx-6 mb-3">
                <div className={`flex items-center gap-1 p-2 border-b ${cardBorderColor} ${isLight ? 'bg-gray-50' : 'bg-slate-700'}`}>
                  {/* Heading Dropdown */}
                  <div className={`w-16 h-7 text-xs ${cardBgColor} border ${cardBorderColor} rounded px-1 flex items-center justify-between`}>
                    <Type className="h-3 w-3" />
                    <ChevronDown className="h-2 w-2" />
                  </div>

                  {/* Formatting Buttons */}
                  <div className="flex">
                    <button className="h-7 w-7 p-0 bg-accent text-accent-foreground rounded flex items-center justify-center">
                      <Bold className="h-3 w-3" />
                    </button>
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <Italic className="h-3 w-3" />
                    </button>
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <Underline className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Divider */}
                  <div className={`h-5 w-px ${isLight ? 'bg-gray-300' : 'bg-slate-600'}`} />

                  {/* Alignment Controls */}
                  <div className="flex">
                    <button className="h-7 w-7 p-0 bg-accent text-accent-foreground rounded flex items-center justify-center">
                      <AlignLeft className="h-3 w-3" />
                    </button>
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <AlignCenter className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Divider */}
                  <div className={`h-5 w-px ${isLight ? 'bg-gray-300' : 'bg-slate-600'}`} />

                  {/* List Controls */}
                  <div className="flex">
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <List className="h-3 w-3" />
                    </button>
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <ListOrdered className="h-3 w-3" />
                    </button>
                    <button className={`h-7 w-7 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <Quote className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Note Content Area - Theme-aware background */}
              <div className="flex-1 mx-6 mb-3">
                <div className={`${isLight ? 'bg-white' : 'bg-slate-800'} rounded-lg p-4 space-y-3 min-h-[200px]`}>
                  <h2 className={`text-lg font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>An Easy Choice</h2>

                  <p className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Intelligently combining <strong>lists,</strong> <u>notes</u> and <em>whiteboards</em> into one platform. Planning tasks or brainstorming projects? We got your ticket to an easy productivity boost.</p>

                  <div className="space-y-1">
                    <p className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Key benefits include custom color coding for visual organization, real-time cloud synchr<span className={isLight ? 'text-gray-400' : 'text-slate-500'}>onization across all your devices, intelligent AI suggestions to boost productivity, and seamless category management to keep everything organized.</span></p>
                  </div>
                </div>
              </div>

              {/* Note Footer Section - matches list component structure */}
              <div className={`px-6 py-4 border-t ${cardBorderColor}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Last edited: Just now
                  </div>
                  <div title="AI-powered suggestions">
                    <Sparkles className="h-4 w-4" style={{ color: '#06B6D4' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Mock Whiteboard Component */}
            <div className={`${cardBgColor} rounded-xl shadow-sm border ${cardBorderColor} overflow-hidden h-full flex flex-col`}>
              {/* Whiteboard Header */}
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`inline-block w-3 h-3 rounded-full border ${isLight ? 'border-gray-400' : 'border-slate-500'}`}
                      style={{ backgroundColor: '#10B981' }}
                    />
                    <Palette className={`h-4 w-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                    <h3 className={`font-semibold ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Project Brainstorming</h3>
                  </div>
                  <div className="flex items-center">
                    <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
                    <button className="ml-2 p-1">
                      <div className="h-4 w-4 flex flex-col justify-center items-center">
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full mb-0.5`}></div>
                        <div className={`w-1 h-1 ${isLight ? 'bg-gray-400' : 'bg-slate-500'} rounded-full`}></div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-3 px-6">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-green-500 text-white cursor-pointer" style={{ backgroundColor: '#10B981', fontFamily: '"Raleway", sans-serif' }}>
                  Design
                </div>
              </div>

              {/* Whiteboard Toolbar Demo */}
              <div className="mx-6 mb-3">
                <div className={`flex items-center gap-2 p-2 border ${cardBorderColor} ${isLight ? 'bg-gray-50' : 'bg-slate-700'} rounded-t-lg`}>
                  {/* Pen/Eraser toggle */}
                  <div className="flex gap-1">
                    <button className="h-6 w-6 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center">
                      <Brush className="h-3 w-3" />
                    </button>
                    <button className={`h-6 w-6 p-0 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-600'} rounded flex items-center justify-center`}>
                      <Eraser className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Color Palette - reduced to 4 colors */}
                  <div className="flex gap-1">
                    <button
                      className="w-5 h-5 rounded border-2 border-blue-700 shadow-sm"
                      style={{ backgroundColor: '#2563eb' }}
                    />
                    <button
                      className={`w-5 h-5 rounded border ${isLight ? 'border-gray-300 hover:border-gray-400' : 'border-slate-600 hover:border-slate-500'} shadow-sm`}
                      style={{ backgroundColor: '#000000' }}
                    />
                    <button
                      className={`w-5 h-5 rounded border ${isLight ? 'border-gray-300 hover:border-gray-400' : 'border-slate-600 hover:border-slate-500'} shadow-sm`}
                      style={{ backgroundColor: '#FF0000' }}
                    />
                    <button
                      className={`w-5 h-5 rounded border ${isLight ? 'border-gray-300 hover:border-gray-400' : 'border-slate-600 hover:border-slate-500'} shadow-sm`}
                      style={{ backgroundColor: '#00FF00' }}
                    />
                  </div>

                  {/* Simplified brush size indicator */}
                  <div className="flex items-center gap-1">
                    <span className={`text-xs ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>Size:</span>
                    <div className={`w-8 h-1.5 ${isLight ? 'bg-gray-200' : 'bg-slate-600'} rounded-full relative`}>
                      <div className="absolute left-1/3 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full border border-white shadow"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Whiteboard Canvas Area */}
              <div className="flex-1 mx-6 mb-3">
                <div
                  className="bg-white rounded-b-lg h-full flex flex-col relative border border-gray-200 border-t-0"
                  style={{
                    minHeight: '280px'
                  }}
                >
                  {/* Itemize logo */}
                  <div className="p-4 flex-1 flex flex-col justify-center items-center">
                    <img
                      src="/icon.png"
                      alt="Itemize logo"
                      className="w-32 h-32 object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Whiteboard Footer Section - matches other components */}
              <div className={`px-6 py-4 border-t ${cardBorderColor}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Last edited: Just now
                  </div>
                  <div title="AI-powered suggestions">
                    <Sparkles className="h-4 w-4 text-green-500" />
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

        {/* Progress Section */}
        <div className="max-w-6xl mx-auto mt-20">
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-light italic ${textColor} mb-4`} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Roadmap to 1.0
            </h2>

            {/* Version Notes Link */}
            <div className="mb-8 flex justify-center">
              <button
                onClick={() => navigate('/help/Version/0.8.2-overview')}
                className="text-sm text-blue-500 hover:text-blue-600 flex items-center transition-colors"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Version 0.8.2 Notes
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className={`${cardBgColor} rounded-lg p-8 border ${cardBorderColor} max-w-4xl mx-auto mb-12`}>
            <div className="space-y-6">
              {/* Overall Progress */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className={`progress-bar-text text-lg font-medium italic ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>v0.8.2</span>
                  <span className={`progress-bar-text text-lg font-medium italic ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>v1.0 Stable Release</span>
                </div>
                <div className={`w-full bg-gray-300 rounded-full h-3 ${isLight ? 'bg-gray-300' : 'bg-slate-700'}`}>
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500" style={{ width: '82%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
