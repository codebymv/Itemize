import React from 'react';
import { X } from 'lucide-react';

interface NotAvailableCTAProps {
  contentType: 'list' | 'note' | 'whiteboard';
  error?: string;
  onBackToHome: () => void;
}

export const NotAvailableCTA: React.FC<NotAvailableCTAProps> = ({
  contentType,
  error,
  onBackToHome
}) => {
  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'list': return 'list';
      case 'note': return 'note';
      case 'whiteboard': return 'whiteboard';
      default: return 'content';
    }
  };

  const getDefaultErrorMessage = () => {
    const label = getContentTypeLabel();
    return `The shared ${label} you're looking for could not be found.`;
  };

  return (
    <div className="text-center py-4">
      <div className="max-w-md mx-auto">
        <h2 
          className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center justify-center gap-2"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          <X className="h-6 w-6 text-red-500" />
          Content Not Available...
        </h2>
        <p 
          className="text-gray-600 dark:text-gray-400 mb-6"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          {error || getDefaultErrorMessage()}
        </p>
        <button
          onClick={onBackToHome}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md transition-colors"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          Go to Itemize.cloud
        </button>
      </div>
    </div>
  );
};
