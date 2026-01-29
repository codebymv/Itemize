import React from 'react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, Book, MessageSquare, Twitter, Github, Mail, ArrowUp, Palette, Activity, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from '@/contexts/AuthContext';

const Footer: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { currentUser } = useAuthState();

  const currentYear = new Date().getFullYear();

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleContact = () => {
    toast({
      title: 'Contact Us',
      description: 'Email us at support@itemize.cloud',
    });
  };

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Section */}
          <div className="md:col-span-2">
            <div className="flex items-center mb-4">
              <img 
                src={theme === 'dark' ? '/cover_whitetext.png' : '/cover.png'} 
                alt="Itemize" 
                className="h-10 w-auto cursor-pointer" 
                onClick={() => handleNavigate('/')}
              />
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Organize thoughts, ideas, projects and more with AI-enhanced tools.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-medium mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                {/* <Button 
                  variant="ghost" 
                  className="w-full justify-start pl-0 text-muted-foreground hover:text-foreground"
                  onClick={() => handleNavigate('/')}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Button> */}
              </li>
              {currentUser && (
                <li>
                  <Button
                    variant="ghost"
                    className="w-full justify-start pl-2 text-muted-foreground hover:text-foreground"
                    onClick={() => handleNavigate('/canvas')}
                  >
                    <Palette className="mr-2 h-4 w-4" />
                    Canvas
                  </Button>
                </li>
              )}
              <li>
                <Button
                  variant="ghost"
                  className="w-full justify-start pl-2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleNavigate('/help')}
                >
                  <Book className="mr-2 h-4 w-4" />
                  Help
                </Button>
              </li>
              <li>
                <Button
                  variant="ghost"
                  className="w-full justify-start pl-2 text-muted-foreground hover:text-foreground"
                  onClick={() => handleNavigate('/status')}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  Status
                </Button>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h3 className="text-sm font-medium mb-4">Connect</h3>
            <div className="flex space-x-4 mb-4">
              <Button variant="outline" size="icon" onClick={() => window.open('https://twitter.com/codebymv', '_blank')}>
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => window.open('https://github.com/codebymv/itemize', '_blank')}>
                <Github className="h-4 w-4" />
              </Button>
              {/* <Button variant="outline" size="icon" onClick={handleContact}>
                <Mail className="h-4 w-4" />
              </Button> */}
              <Button variant="outline" size="icon" onClick={() => window.open('https://codebymv.com', '_blank')}>
                <Globe className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t pt-6 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            © {currentYear} Itemize. All rights reserved.
          </p>
          
          <div className="flex items-center space-x-6">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground"
              onClick={() => handleNavigate('/help/terms-of-service')}
            >
              Terms of Service
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground flex items-center"
              onClick={scrollToTop}
            >
              Back to top
              <ArrowUp className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
