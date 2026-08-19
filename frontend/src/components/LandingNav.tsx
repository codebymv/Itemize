import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ArrowRight,
  Users,
  TrendingUp,
  Calendar,
  Zap,
  Layers,
  CheckSquare,
  StickyNote,
  Palette,
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
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    ? 'bg-background/90 backdrop-blur-xl shadow-sm border-b border-border/50'
    : 'bg-background/0';

  const textColor = 'text-muted-foreground';
  const textColorHover = 'hover:text-foreground';
  const activeTextColor = 'text-blue-600 dark:text-blue-400';

  return (
    <header className={cn('fixed top-0 left-0 right-0 z-50 transition-colors duration-300', navBg)}>
      <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <div className="flex-shrink-0">
            <button 
              onClick={() => handleNavClick('hero')}
              className="flex items-center"
              aria-label="Itemize home"
            >
              <img
                src="/cover-nav.webp"
                alt="Itemize"
                className="h-10 md:h-12 w-auto dark:hidden"
                width={240}
                height={96}
                decoding="async"
              />
              <img
                src="/cover_whitetext-nav.webp"
                alt=""
                aria-hidden="true"
                className="hidden h-10 md:h-12 w-auto dark:block"
                width={240}
                height={96}
                decoding="async"
              />
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center">
            <NavigationMenu>
              <NavigationMenuList className="gap-0">
                {/* Features Dropdown */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger 
                    className={cn(
                      'bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent px-3 py-2 text-sm font-medium transition-colors',
                      textColor,
                      textColorHover,
                      activeSection === 'features' && activeTextColor
                    )}
                  >
                    Features
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className={cn(
                      'w-[480px] p-4 bg-popover'
                    )}>
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-slate-700">
                        <Users className={cn(
                          'h-5 w-5 text-blue-600 dark:text-blue-400'
                        )} />
                        <span className={cn(
                          'font-semibold text-foreground'
                        )}>
                          Core CRM Features
                        </span>
                      </div>
                      <div className="grid gap-3 grid-cols-2">
                        {FEATURE_ITEMS.map((item) => (
                          <button
                            key={item.title}
                            onClick={() => handleNavClick(item.sectionId)}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg transition-colors text-left hover:bg-accent'
                            )}
                          >
                            <div className={cn(
                              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-900/30'
                            )}>
                              <item.icon className={cn(
                                'h-5 w-5 text-blue-600 dark:text-blue-400'
                              )} />
                            </div>
                            <div>
                              <div className={cn(
                                'font-medium text-sm text-foreground'
                              )}>
                                {item.title}
                              </div>
                              <div className={cn(
                                'text-xs mt-0.5 text-muted-foreground'
                              )}>
                                {item.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleNavClick('features')}
                        className={cn(
                          'flex items-center gap-1 mt-4 pt-4 border-t w-full text-sm font-medium transition-colors border-border text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                        )}
                      >
                        Explore all features
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* Workspaces Dropdown */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger 
                    className={cn(
                      'bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent px-3 py-2 text-sm font-medium transition-colors',
                      textColor,
                      textColorHover,
                      activeSection === 'workspaces' && activeTextColor
                    )}
                  >
                    Workspaces
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[320px] p-4 bg-popover">
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                        <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span className={cn(
                          'font-semibold text-foreground'
                        )}>
                          Built-in Productivity
                        </span>
                      </div>
                      <div className="space-y-2">
                        {WORKSPACE_ITEMS.map((item) => (
                          <button
                            key={item.title}
                            onClick={() => handleNavClick('workspaces')}
                            className="flex items-start gap-3 w-full p-3 rounded-lg transition-colors text-left hover:bg-accent"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30">
                              <item.icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                              <div className={cn(
                                'font-medium text-sm text-foreground'
                              )}>
                                {item.title}
                              </div>
                              <div className={cn(
                                'text-xs mt-0.5 text-muted-foreground'
                              )}>
                                {item.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleNavClick('workspaces')}
                        className="flex items-center gap-1 mt-4 pt-4 border-t w-full text-sm font-medium transition-colors border-border text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        Explore workspaces
                        <ArrowRight className="h-4 w-4" />
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
                className="w-[300px] sm:w-[350px] flex flex-col bg-background"
              >
                {/* Mobile Header */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center">
                    <img
                      src="/cover-nav.webp"
                      alt="Itemize"
                      className="h-8 w-auto dark:hidden"
                      width={240}
                      height={96}
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      src="/cover_whitetext-nav.webp"
                      alt=""
                      aria-hidden="true"
                      className="hidden h-8 w-auto dark:block"
                      width={240}
                      height={96}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>

                {/* Mobile Nav Links */}
                <nav className="flex-1 py-4 space-y-1 overflow-y-auto min-h-0">
                  {[
                    { id: 'features', label: 'Features' },
                    { id: 'workspaces', label: 'Workspaces' },
                    { id: 'integrations', label: 'Integrations' },
                    { id: 'pricing', label: 'Pricing' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={cn(
                        'w-full flex items-center px-3 py-3 rounded-lg text-left font-medium transition-colors',
                        activeSection === item.id
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>

                {/* Mobile CTAs - Fixed at bottom */}
                <div className="pt-4 pb-2 border-t border-gray-200 dark:border-slate-700 space-y-3 mt-auto">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleSignIn();
                    }}
                    className="w-full border-border"
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
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default LandingNav;
