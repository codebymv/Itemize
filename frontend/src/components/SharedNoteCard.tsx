import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StickyNote } from 'lucide-react';

const NEUTRAL_GRAY = '#808080';

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

  // Category display matching canvas logic
  const displayCategory = noteData.category || 'General';
  const displayColor = displayCategory === 'General' ? NEUTRAL_GRAY : noteColor;

// Render content - just return it, prose classes are on the parent
  const renderContent = (content: string) => {
    if (!content || content === '<p></p>' || content.trim() === '') {
      return <p className="text-gray-400 dark:text-gray-300 text-sm italic font-raleway">This note is empty.</p>;
    }

    // Content is HTML or plain text - render it directly, prose classes handle styling
    if (content.includes('<') && content.includes('>')) {
      return <div dangerouslySetInnerHTML={{ __html: content }} />;
    }

    // Plain text - convert to paragraphs
    const lines = content.split('\n');
    return lines.map((line, index) => {
      if (line.trim() === '') {
        return <br key={index} />;
      }
      return (
        <p key={index} className="text-sm mb-2 last:mb-0 font-raleway">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
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
              <div
                className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white mt-1 font-raleway border-none"
                style={{
                  backgroundColor: displayColor
                }}
              >
                {displayCategory}
              </div>
            </div>
          </div>
        </CardHeader>

{/* Content */}
        <CardContent className="pt-0">
          <style>{`
            .shared-note-content p, .shared-note-content div, .shared-note-content span, .shared-note-content code, .shared-note-content pre, .shared-note-content li {
              overflow-wrap: break-word !important;
              word-wrap: break-word !important;
              word-break: break-word !important;
            }
          `}</style>
          <div className="shared-note-content prose prose-sm prose-slate dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&_img]:max-w-full [&_img]:h-auto [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_code]:break-all [&_code]:whitespace-pre-wrap [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:w-full text-gray-900 dark:text-gray-100">
            {renderContent(noteData.content)}
          </div>
        </CardContent>
      </Card>

      {/* Creator Attribution */}
      <div className="mt-4 text-center">
        <p 
          className="text-sm text-gray-500 dark:text-gray-400 font-raleway"
        >
          Created by <span className="font-medium">{noteData.creator_name}</span> on{' '}
          {new Date(noteData.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
