import React from 'react';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { LogIn, LogOut, User, Sun, Moon, Sparkles, Palette, Settings, Book, Activity, ShieldCheck, Zap, Crown, Building2, Mail, BarChart3, ChevronRight } from 'lucide-react';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { PLAN_METADATA, type Plan } from '@/lib/subscription';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// Admin navigation items for dropdown
const adminNavItems = [
  { title: 'Communications', path: '/admin', icon: Mail },
  { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
  { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
];

const Navbar: React.FC = () => {

  const { currentUser } = useAuthState();
  const { logout } = useAuthActions();
  const { theme, setTheme } = useTheme();
  const { aiEnabled, setAiEnabled } = useAISuggest();
  const { toast } = useToast();
  const { subscription } = useSubscriptionState();
  const location = useLocation();
  const navigate = useNavigate();


  const handleLogin = () => {
    navigate('/login');
  };

  // Function to get user initials
  const getUserInitials = (name: string, email: string): string => {
    if (name && name.trim()) {
      const nameParts = name.trim().split(' ');
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      }
      return nameParts[0][0].toUpperCase();
    }
    // Fallback to email if no name
    return email ? email[0].toUpperCase() : 'U';
  };

  // Get tier icon based on subscription plan
  const getTierIcon = (plan?: Plan) => {
    if (!plan) return User;
    const iconName = PLAN_METADATA[plan]?.icon || 'user';
    const iconMap = {
      user: User,
      zap: Zap,
      crown: Crown,
      building: Building2
    };
    return iconMap[iconName] || User;
  };

  // Get current plan
  const currentPlan = (subscription?.planName?.toLowerCase() as Plan) || 'free';
  const TierIcon = getTierIcon(currentPlan);

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Goodbye!',
        description: 'Successfully signed out.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleNavigate = (path: string) => {
    // For logo clicks, direct to appropriate home page based on auth status
    if (path === '/') {
      navigate(currentUser ? '/dashboard' : '/home');
    } else {
      navigate(path);
    }
  };

  const isOnAdminRoute = location.pathname.startsWith('/admin');
  const [adminOpen, setAdminOpen] = React.useState(isOnAdminRoute);

  React.useEffect(() => {
    setAdminOpen(isOnAdminRoute);
  }, [isOnAdminRoute]);

  return (
    <nav className="border-b backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderBottomColor: theme === 'dark' ? '#475569' : '#e5e7eb' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <img 
              src={theme === 'dark' ? '/cover_whitetext.png' : '/cover.png'} 
              alt="Itemize" 
              className="h-16 w-auto cursor-pointer" 
              onClick={() => handleNavigate('/')}
            />
          </div>

          <div className="flex items-center md:space-x-4">
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 bg-blue-600 hover:bg-blue-700 border-0">
                    <User className="h-5 w-5 text-white" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center gap-1">
                        {currentUser?.role === 'ADMIN' && (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        <TierIcon className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {currentUser.name || 'User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {currentUser.email}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  
                  {/* Admin Dashboard Collapsible - Only shown for ADMIN users */}
                  {currentUser?.role === 'ADMIN' && (() => {
                    return (
                      <>
                        <DropdownMenuSeparator />
                        <div className="w-full">
                          <Collapsible open={adminOpen} onOpenChange={setAdminOpen} className="w-full group/collapsible">
                            <CollapsibleTrigger asChild>
                              <DropdownMenuItem 
                                className="w-full cursor-pointer group/admin"
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setAdminOpen(true);
                                  handleNavigate('/admin');
                                }}
                              >
                                <ShieldCheck className={cn("mr-2 h-4 w-4 transition-colors", isOnAdminRoute ? "text-blue-600" : "group-hover/admin:text-blue-600")} />
                                <span className="flex-1">Admin Dashboard</span>
                                <ChevronRight className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                              </DropdownMenuItem>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
                              <div className="pl-6 py-1">
                                {adminNavItems.map((item) => {
                                  const isActive = location.pathname === item.path || 
                                    (item.path !== '/admin' && location.pathname.startsWith(item.path));
                                  
                                  return (
                                    <DropdownMenuItem
                                      key={item.path}
                                      onClick={() => handleNavigate(item.path)}
                                      className={cn(
                                        "cursor-pointer",
                                        isActive && "bg-muted"
                                      )}
                                    >
                                      <span className="flex-1">{item.title}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </>
                    );
                  })()}
                  
                  <DropdownMenuSeparator />
                  
                  {/* Theme Section */}
                  <div className="px-2 py-2">
                    <div className="flex items-center mb-2">
                      <Settings className="mr-2 h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Theme</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 ml-6">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          theme === 'light' 
                            ? 'bg-accent text-accent-foreground' 
                            : 'hover:bg-accent/80 hover:text-accent-foreground'
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        Light
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          theme === 'dark' 
                            ? 'bg-accent text-accent-foreground' 
                            : 'hover:bg-accent/80 hover:text-accent-foreground'
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        Dark
                      </button>
                    </div>
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  {/* AI Suggestions Section */}
                  <div className="px-2 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Sparkles className="mr-2 h-4 w-4 text-blue-600" />
                        <Label htmlFor="ai-suggest-toggle" className="text-sm font-medium">
                          AI Enhancements
                        </Label>
                      </div>
                      <Switch
                        id="ai-suggest-toggle"
                        checked={aiEnabled}
                        onCheckedChange={setAiEnabled}
                      />
                    </div>
                  </div>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleNavigate('/help')}>
                    <Book className="mr-2 h-4 w-4 text-blue-600" />
                    <span className="flex-1">Help</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleNavigate('/status')}>
                    <Activity className="mr-2 h-4 w-4 text-blue-600" />
                    <span className="flex-1">Status</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4 text-red-600" />
                    <span className="flex-1">Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleLogin} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-light" size="sm">
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;