import React, { useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Link,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Variable,
  Eye,
  Code,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Available template variables
const TEMPLATE_VARIABLES = [
  { key: 'first_name', label: 'First Name', example: 'John' },
  { key: 'last_name', label: 'Last Name', example: 'Doe' },
  { key: 'full_name', label: 'Full Name', example: 'John Doe' },
  { key: 'email', label: 'Email', example: 'john@example.com' },
  { key: 'phone', label: 'Phone', example: '+1 555-1234' },
  { key: 'company', label: 'Company', example: 'Acme Inc' },
  { key: 'job_title', label: 'Job Title', example: 'Marketing Manager' },
];

interface EmailTemplateEditorProps {
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  onSubjectChange: (subject: string) => void;
  onBodyHtmlChange: (html: string) => void;
  onBodyTextChange?: (text: string) => void;
  previewMode?: boolean;
}

export function EmailTemplateEditor({
  subject,
  bodyHtml,
  bodyText,
  onSubjectChange,
  onBodyHtmlChange,
  onBodyTextChange,
  previewMode = false,
}: EmailTemplateEditorProps) {
  const [showPreview, setShowPreview] = useState(previewMode);
  const [activeTab, setActiveTab] = useState<'visual' | 'html'>('visual');

  // Sample data for preview
  const sampleData: Record<string, string> = {};
  TEMPLATE_VARIABLES.forEach(v => {
    sampleData[v.key] = v.example;
  });

  // Replace variables with sample data for preview
  const replaceVariables = (text: string) => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return sampleData[key] || match;
    });
  };

  // Insert variable at cursor position
  const insertVariable = (textareaId: string, variable: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const variableText = `{{${variable}}}`;
    const newText = text.substring(0, start) + variableText + text.substring(end);

    if (textareaId === 'subject-input') {
      onSubjectChange(newText);
    } else if (textareaId === 'body-html-input') {
      onBodyHtmlChange(newText);
    } else if (textareaId === 'body-text-input' && onBodyTextChange) {
      onBodyTextChange(newText);
    }

    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableText.length, start + variableText.length);
    }, 0);
  };

  // Simple HTML formatting helpers
  const wrapSelection = (textareaId: string, before: string, after: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);

    onBodyHtmlChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const formatBold = () => wrapSelection('body-html-input', '<strong>', '</strong>');
  const formatItalic = () => wrapSelection('body-html-input', '<em>', '</em>');
  const formatUnderline = () => wrapSelection('body-html-input', '<u>', '</u>');

  // Extract detected variables from content
  const detectedVariables = [...new Set(
    [...(subject.match(/\{\{(\w+)\}\}/g) || []), ...(bodyHtml.match(/\{\{(\w+)\}\}/g) || [])]
      .map(v => v.replace(/\{\{|\}\}/g, ''))
  )];

  return (
    <div className="space-y-4">
      {/* Subject line */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="subject-input">Subject Line</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Variable className="h-4 w-4 mr-1" />
                Insert Variable
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {TEMPLATE_VARIABLES.map(v => (
                <DropdownMenuItem key={v.key} onClick={() => insertVariable('subject-input', v.key)}>
                  {v.label} <span className="text-muted-foreground ml-2">{'{{' + v.key + '}}'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Input
          id="subject-input"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Enter email subject..."
        />
        {showPreview && (
          <p className="text-sm text-muted-foreground mt-1">
            Preview: {replaceVariables(subject)}
          </p>
        )}
      </div>

      {/* Email body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Email Body</Label>
          <div className="flex items-center gap-2">
            <Button
              variant={showPreview ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'visual' | 'html')}>
          <TabsList className="mb-2">
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            {onBodyTextChange && <TabsTrigger value="text">Plain Text</TabsTrigger>}
          </TabsList>

          <TabsContent value="visual">
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-2 p-2 border rounded-t-lg bg-muted/50">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={formatBold} title="Bold">
                <Bold className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={formatItalic} title="Italic">
                <Italic className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={formatUnderline} title="Underline">
                <Underline className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => wrapSelection('body-html-input', '<a href="">', '</a>')}
                title="Link"
              >
                <Link className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => wrapSelection('body-html-input', '<ul><li>', '</li></ul>')}
                title="Bullet List"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => wrapSelection('body-html-input', '<ol><li>', '</li></ol>')}
                title="Numbered List"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <div className="flex-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Variable className="h-4 w-4 mr-1" />
                    Variable
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {TEMPLATE_VARIABLES.map(v => (
                    <DropdownMenuItem key={v.key} onClick={() => insertVariable('body-html-input', v.key)}>
                      {v.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Textarea
              id="body-html-input"
              value={bodyHtml}
              onChange={(e) => onBodyHtmlChange(e.target.value)}
              placeholder="<p>Hello {{first_name}},</p>&#10;&#10;<p>Your email content here...</p>"
              rows={12}
              className="font-mono text-sm rounded-t-none"
            />
          </TabsContent>

          <TabsContent value="html">
            <Textarea
              id="body-html-input"
              value={bodyHtml}
              onChange={(e) => onBodyHtmlChange(e.target.value)}
              placeholder="<html>...</html>"
              rows={15}
              className="font-mono text-sm"
            />
          </TabsContent>

          {onBodyTextChange && (
            <TabsContent value="text">
              <div className="flex items-center justify-end mb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Variable className="h-4 w-4 mr-1" />
                      Variable
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {TEMPLATE_VARIABLES.map(v => (
                      <DropdownMenuItem key={v.key} onClick={() => insertVariable('body-text-input', v.key)}>
                        {v.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                id="body-text-input"
                value={bodyText || ''}
                onChange={(e) => onBodyTextChange?.(e.target.value)}
                placeholder="Plain text version..."
                rows={12}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Preview */}
      {showPreview && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium mb-2">Email Preview</h4>
            <div className="border rounded-lg p-4 bg-white">
              <p className="font-medium text-gray-900 mb-4">{replaceVariables(subject)}</p>
              <div 
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: replaceVariables(bodyHtml) }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detected variables */}
      {detectedVariables.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Detected Variables:</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {detectedVariables.map(v => (
              <Badge key={v} variant="secondary" className="text-xs">
                {'{{'}{v}{'}}'}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailTemplateEditor;
