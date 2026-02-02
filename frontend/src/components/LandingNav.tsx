import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { useScrollSpy, scrollToSection } from '@/hooks/useScrollSpy';
import { 
  Menu, 
  X, 
  ArrowRight,
  Users,
  TrendingUp,
  Calendar,
  Zap,
  Layers,
  CheckSquare,
  StickyNote,
  Palette,
  Shield,
  CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Section configuration for navigation
const SECTIONS = [
  { id: 'hero', label: 'Home' },
  { id: 'problem', label: 'Why Itemize' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'features', label: 'Features' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Security' },
  { id: 'pricing', label: 'Pricing' },
] as const;

// Feature items for the mega menu
const FEATURE_ITEMS = [
  {
    title: 'Contact Management',
    description: 'Unified customer profiles with complete history',
    icon: Users,
    sectionId: 'features',
  },
  {
    title: 'Sales Pipelines',
    description: 'Visual deal tracking with custom stages',
    icon: TrendingUp,
    sectionId: 'features',
  },
  {
    title: 'Calendars & Booking',
    description: 'Online scheduling with automatic reminders',
    icon: Calendar,
    sectionId: 'features',
  },
  {
    title: 'Automations',
    description: 'Workflows that handle busywork for you',
    icon: Zap,
    sectionId: 'features',
  },
];

const WORKSPACE_ITEMS = [
  {
    title: 'Smart Lists',
    description: 'AI-powered task management',
    icon: CheckSquare,
  },
  {
    title: 'Rich Notes',
    description: 'Formatting, media, and more',
    icon: StickyNote,
  },
  {
    title: 'Whiteboards',
    description: 'Infinite canvas for brainstorming',
    icon: Palette,
  },
];

export const LandingNav: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isLight = theme === 'light';
  
  // Section IDs for scroll spy
  const sectionIds = SECTIONS.map(s => s.id);
  const activeSection = useScrollSpy({ sectionIds, offset: 100 });

  // Track scroll for sticky header styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    scrollToSection(sectionId, 80);
    setIsMobileMenuOpen(false);
  };

  const handleGetStarted = () => {
    navigate('/register');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  // Theme-aware colors
  const navBg = isScrolled
    ? isLight
      ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200/50'
      : 'bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-700/50'
    : 'bg-transparent';

  const textColor = isLight ? 'text-gray-700' : 'text-slate-300';
  const textColorHover = isLight ? 'hover:text-gray-900' : 'hover:text-white';
  const activeTextColor = isLight ? 'text-blue-600' : 'text-blue-400';

  return (
    <header className={cn('fixed top-0 left-0 right-0 z-50 transition-all duration-300', navBg)}>
      <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <div className="flex-shrink-0">
            <button 
              onClick={() => handleNavClick('hero')}
              className="flex items-center"
            >
              <img 
                src={isLight ? "/textblack.png" : "/textwhite.png"}
                alt="Itemize" 
                className="h-8 md:h-10 w-auto"
              />
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            <NavigationMenu>
              <NavigationMenuList>
                {/* Features Dropdown */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger 
                    className={cn(
                      'bg-transparent px-3 py-2 text-sm font-medium transition-colors',
                      textColor,
                      textColorHover,
                      activeSection === 'features' && activeTextColor
                    )}
                  >
                    Features
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className={cn(
                      'w-[500px] p-4 rounded-xl',
                      isLight ? 'bg-white' : 'bg-slate-800'
                    )}>
                      <div className="grid gap-3 grid-cols-2">
                        {FEATURE_ITEMS.map((item) => (
                          <button
                            key={item.title}
                            onClick={() => handleNavClick(item.sectionId)}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg transition-colors text-left',
                              isLight ? 'hover:bg-gray-50' : 'hover:bg-slate-700'
                            )}
                          >
                            <div className={cn(
                              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                              isLight ? 'bg-blue-50' : 'bg-blue-900/30'
                            )}>
                              <item.icon className={cn(
                                'h-5 w-5',
                                isLight ? 'text-blue-600' : 'text-blue-400'
                              )} />
                            </div>
                            <div>
                              <div className={cn(
                                'font-medium text-sm',
                                isLight ? 'text-gray-900' : 'text-slate-100'
                              )}>
                                {item.title}
                              </div>
                              <div className={cn(
                                'text-xs mt-0.5',
                                isLight ? 'text-gray-500' : 'text-slate-400'
                              )}>
                                {item.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* Workspaces Dropdown */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger 
                    className={cn(
                      'bg-transparent px-3 py-2 text-sm font-medium transition-colors',
                      textColor,
                      textColorHover,
                      activeSection === 'workspaces' && activeTextColor
                    )}
                  >
                    Workspaces
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className={cn(
                      'w-[350px] p-4 rounded-xl',
                      isLight ? 'bg-white' : 'bg-slate-800'
                    )}>
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-slate-700">
                        <Layers className={cn(
                          'h-5 w-5',
                          isLight ? 'text-indigo-600' : 'text-indigo-400'
                        )} />
                        <span className={cn(
                          'font-semibold',
                          isLight ? 'text-gray-900' : 'text-slate-100'
                        )}>
                          Built-in Productivity
                        </span>
                      </div>
                      <div className="space-y-2">
                        {WORKSPACE_ITEMS.map((item) => (
                          <button
                            key={item.title}
                            onClick={() => handleNavClick('workspaces')}
                            className={cn(
                              'flex items-center gap-3 w-full p-2 rounded-lg transition-colors text-left',
                              isLight ? 'hover:bg-gray-50' : 'hover:bg-slate-700'
                            )}
                          >
                            <item.icon className={cn(
                              'h-4 w-4',
                              isLight ? 'text-gray-600' : 'text-slate-400'
                            )} />
                            <div>
                              <div className={cn(
                                'font-medium text-sm',
                                isLight ? 'text-gray-900' : 'text-slate-100'
                              )}>
                                {item.title}
                              </div>
                              <div className={cn(
                                'text-xs',
                                isLight ? 'text-gray-500' : 'text-slate-400'
                              )}>
                                {item.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleNavClick('workspaces')}
                        className={cn(
                          'flex items-center gap-1 mt-3 pt-3 border-t text-sm font-medium',
                          isLight ? 'border-gray-200 text-blue-600 hover:text-blue-700' : 'border-slate-700 text-blue-400 hover:text-blue-300'
                        )}
                      >
                        Learn more
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* Simple nav items */}
                <NavigationMenuItem>
                  <button
                    onClick={() => handleNavClick('integrations')}
                    className={cn(
                      'px-3 py-2 text-sm font-medium transition-colors rounded-md',
                      textColor,
                      textColorHover,
                      activeSection === 'integrations' && activeTextColor
                    )}
                  >
                    Integrations
                  </button>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <button
                    onClick={() => handleNavClick('pricing')}
                    className={cn(
                      'px-3 py-2 text-sm font-medium transition-colors rounded-md',
                      textColor,
                      textColorHover,
                      activeSection === 'pricing' && activeTextColor
                    )}
                  >
                    Pricing
                  </button>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={handleSignIn}
              className={cn(
                'font-medium',
                textColor,
                textColorHover
              )}
            >
              Sign In
            </Button>
            <Button 
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="lg:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className={textColor}
                >
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent 
                side="right" 
                className={cn(
                  'w-[300px] sm:w-[350px]',
                  isLight ? 'bg-white' : 'bg-slate-900'
                )}
              >
                <div className="flex flex-col h-full">
                  {/* Mobile Header */}
                  <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-slate-700">
                    <img 
                      src={isLight ? "/textblack.png" : "/textwhite.png"}
                      alt="Itemize" 
                      className="h-8 w-auto"
                    />
                  </div>

                  {/* Mobile Nav Links */}
                  <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
                    {SECTIONS.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => handleNavClick(section.id)}
                        className={cn(
                          'w-full flex items-center px-3 py-3 rounded-lg text-left font-medium transition-colors',
                          activeSection === section.id
                            ? isLight
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-blue-900/30 text-blue-400'
                            : isLight
                              ? 'text-gray-700 hover:bg-gray-50'
                              : 'text-slate-300 hover:bg-slate-800'
                        )}
                      >
                        {section.label}
                      </button>
                    ))}
                  </nav>

                  {/* Mobile CTAs */}
                  <div className="pt-6 border-t border-gray-200 dark:border-slate-700 space-y-3">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        handleSignIn();
                      }}
                      className={cn(
                        'w-full',
                        isLight 
                          ? 'border-gray-300' 
                          : 'border-slate-600'
                      )}
                    >
                      Sign In
                    </Button>
                    <Button 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        handleGetStarted();
                      }}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    >
                      Start Free Trial
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default LandingNav;
