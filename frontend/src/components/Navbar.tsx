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
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, LogOut, User, Sun, Moon, Sparkles, Palette, Settings, Book } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';

const Navbar: React.FC = () => {

  const { currentUser, login, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { aiEnabled, setAiEnabled } = useAISuggest();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();


  const handleLogin = () => {
    try {
      login(); // Initiate login, success/error is handled in AuthContext
    } catch (error) {
      // This catch block might not be necessary if login() itself doesn't throw
      // or if errors are meant to be handled globally by AuthContext.
      // For now, we'll keep it in case login() can throw an immediate error.
      console.error('Error initiating login:', error);
      toast({
        title: 'Error',
        description: 'Could not start sign-in process. Please try again.',
        variant: 'destructive',
      });
    }
  };

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
      navigate(currentUser ? '/canvas' : '/home');
    } else {
      navigate(path);
    }
  };

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
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {currentUser.name || 'User'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {currentUser.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
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
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      Get AI-powered suggestions
                    </p>
                  </div>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleNavigate('/help')}>
                    <Book className="mr-2 h-4 w-4 text-blue-600" />
                    <span>Help</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4 text-red-600" />
                    <span>Log out</span>
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