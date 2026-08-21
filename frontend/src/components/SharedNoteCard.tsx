import React from 'react';
import { SharedItemCard } from '@/components/public/BrandedPublicPage';
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml';

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
  const noteColor = noteData.color_value || '#2563eb';

// Render content - just return it, prose classes are on the parent
  const renderContent = (content: string) => {
    if (!content || content === '<p></p>' || content.trim() === '') {
      return <p className="text-sm italic text-muted-foreground">This note is empty.</p>;
    }

    // Content is HTML or plain text - render it directly, prose classes handle styling
    if (content.includes('<') && content.includes('>')) {
      return <div dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(content) }} />;
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
    <div className="mx-auto w-full max-w-3xl">
      <SharedItemCard
        title={noteData.title}
        contentType="note"
        category={noteData.category || 'General'}
        creatorName={noteData.creator_name}
        createdAt={noteData.created_at}
        isLive={isLive}
        accentColor={noteColor}
      >
          <style>{`
            .shared-note-content p, .shared-note-content div, .shared-note-content span, .shared-note-content code, .shared-note-content pre, .shared-note-content li {
              overflow-wrap: break-word !important;
              word-wrap: break-word !important;
              word-break: break-word !important;
            }
          `}</style>
          <div className="shared-note-content prose prose-sm prose-slate dark:prose-invert max-w-none break-words text-foreground [&>*:first-child]:mt-0 [&_code]:break-all [&_code]:whitespace-pre-wrap [&_img]:h-auto [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto">
            {renderContent(noteData.content)}
          </div>
      </SharedItemCard>
    </div>
  );
};
