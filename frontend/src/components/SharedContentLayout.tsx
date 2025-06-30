import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Home, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SharedContentLayoutProps {
  children: React.ReactNode;
  title: string;
  contentType: 'list' | 'note' | 'whiteboard';
  onBackToHome?: () => void;
  showCTA?: boolean; // Whether to show the "Create your own..." CTA section
  isError?: boolean; // Whether this is an error state (reduces spacing)
}

export const SharedContentLayout: React.FC<SharedContentLayoutProps> = ({
  children,
  title,
  contentType,
  onBackToHome,
  showCTA = true, // Default to true for backward compatibility
  isError = false // Default to false
}) => {
  const { theme } = useTheme();

  // Theme-aware color classes - matching DocsPage pattern
  const bgColor = theme === 'dark' ? 'bg-slate-800' : 'bg-gray-50';
  const textColor = theme === 'dark' ? 'text-slate-100' : 'text-gray-900';
  const mutedTextColor = theme === 'dark' ? 'text-slate-400' : 'text-gray-500';

  const handleBackToHome = () => {
    if (onBackToHome) {
      onBackToHome();
    } else {
      window.location.href = 'https://itemize.cloud';
    }
  };

  const handleCreateAccount = () => {
    window.location.href = 'https://itemize.cloud';
  };

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'list': return 'List';
      case 'note': return 'Note';
      case 'whiteboard': return 'Whiteboard';
      default: return 'Content';
    }
  };

  return (
    <div className={`${bgColor} flex-1 min-h-full`}>
      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-full">
        {/* Back button */}
        <div className="mb-6">
          <Button
            onClick={handleBackToHome}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>

        {/* Content */}
        <div className={`${isError ? 'text-center' : 'text-center'}`}>
          {children}
        </div>

        {/* Footer CTA - only show when showCTA is true */}
        {showCTA && (
          <div className="mt-8 text-center">
            <div className="max-w-md mx-auto">
              <h3
                className={`text-lg font-semibold ${textColor} mb-2`}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Create your own {contentType}s
              </h3>
              <p
                className={`text-sm ${mutedTextColor} mb-4`}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Join Itemize.cloud to organize your thoughts, tasks, and ideas with lists, notes, and whiteboards.
              </p>
              <Button
                onClick={handleCreateAccount}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Get Started Free
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
