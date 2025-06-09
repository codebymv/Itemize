import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, LogOut, User, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';

const Navbar: React.FC = () => {

  const { currentUser, login, logout } = useAuth();
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
      navigate(currentUser ? '/lists' : '/home');
    } else {
      navigate(path);
    }
  };

  // Helper function to get user initials
  const getUserInitials = (user: any) => {
    if (user.name) {
      return user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
    }
    return user.email?.charAt(0).toUpperCase() || 'U';
  };


  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <img 
              src="/cover.png" 
              alt="Itemize" 
              className="h-16 w-auto cursor-pointer" 
              onClick={() => handleNavigate('/')}
            />
          </div>



          <div className="flex items-center md:space-x-4">
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border-2 border-primary/10">
                      <AvatarImage 
                        src={currentUser.photoURL || ''} 
                        alt={currentUser.name || 'User'} 
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getUserInitials(currentUser)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
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
                  {/* <DropdownMenuItem onClick={() => handleNavigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem> */}
                  {/* <DropdownMenuItem onClick={() => handleNavigate('/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem> */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleLogin} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white" size="sm">
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