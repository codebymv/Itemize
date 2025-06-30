import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StickyNote } from 'lucide-react';

interface SharedNoteData {
  id: number;
  title: string;
  content: string;
  category: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'note';
}

interface SharedNoteCardProps {
  noteData: SharedNoteData;
}

export const SharedNoteCard: React.FC<SharedNoteCardProps> = ({ noteData }) => {
  // Use the note's color or default to light yellow
  const noteColor = noteData.color_value || '#FFFFE0';

  // Function to render content with basic formatting
  const renderContent = (content: string) => {
    if (!content) {
      return (
        <p 
          className="text-gray-400 dark:text-gray-300 text-sm italic"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          This note is empty.
        </p>
      );
    }

    // Split content by lines and render with basic formatting
    const lines = content.split('\n');
    return lines.map((line, index) => {
      if (line.trim() === '') {
        return <br key={index} />;
      }
      
      return (
        <p 
          key={index}
          className="text-gray-900 dark:text-gray-100 text-sm mb-2 last:mb-0"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          {line}
        </p>
      );
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <Card
        className="w-full shadow-lg border-2 transition-all duration-200 bg-white dark:bg-slate-800"
        style={{
          borderColor: noteColor
        }}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-gray-600" />
            <div className="flex-1">
              <h3
                className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {noteData.title}
              </h3>
              {noteData.category && (
                <p
                  className="text-sm text-gray-600 dark:text-gray-400"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {noteData.category}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="pt-0">
          <div className="prose prose-sm max-w-none">
            {renderContent(noteData.content)}
          </div>
        </CardContent>
      </Card>

      {/* Creator Attribution */}
      <div className="mt-4 text-center">
        <p 
          className="text-sm text-gray-500 dark:text-gray-400"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          Created by <span className="font-medium">{noteData.creator_name}</span> on{' '}
          {new Date(noteData.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
