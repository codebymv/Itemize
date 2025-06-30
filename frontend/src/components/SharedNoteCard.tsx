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
  isLive?: boolean;
}

export const SharedNoteCard: React.FC<SharedNoteCardProps> = ({ noteData, isLive = false }) => {
  // Use the note's color or default to light yellow
  const noteColor = noteData.color_value || '#FFFFE0';

  // Function to render content with HTML formatting
  const renderContent = (content: string) => {
    if (!content || content === '<p></p>' || content.trim() === '') {
      return (
        <p
          className="text-gray-400 dark:text-gray-300 text-sm italic"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          This note is empty.
        </p>
      );
    }

    // Check if content is HTML or plain text
    if (content.includes('<') && content.includes('>')) {
      // Content is HTML - render it directly
      return (
        <div
          className="prose prose-sm max-w-none dark:prose-invert text-gray-900 dark:text-gray-100"
          style={{ fontFamily: '"Raleway", sans-serif' }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    } else {
      // Content is plain text - convert to paragraphs
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
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <Card
        className="w-full shadow-lg border bg-white dark:bg-slate-800"
        style={{
          '--note-color': noteColor
        } as React.CSSProperties}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {/* Colored dot */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: noteColor }}
              />
              <StickyNote className="h-4 w-4 text-slate-500" />
            </div>
            <div className="flex-1">
              <h3
                className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {noteData.title}
              </h3>
              {noteData.category && (
                <div
                  className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white mt-1"
                  style={{
                    backgroundColor: noteColor,
                    fontFamily: '"Raleway", sans-serif'
                  }}
                >
                  {noteData.category}
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="pt-0">
          <div className="relative">
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
