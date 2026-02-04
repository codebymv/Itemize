import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Eye, Send, FileSignature, ChevronDown, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { SignatureTemplate, listSignatureTemplates, createSignatureTemplate, instantiateSignatureTemplate, deleteSignatureTemplate } from '@/services/signaturesApi';

export default function SignatureTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listSignatureTemplates();
      setTemplates(response || []);
    } catch (error) {
      toast({ title: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleCreate = useCallback(async () => {
    try {
      const created = await createSignatureTemplate({ title: 'New Template' });
      navigate(`/templates/${created.id}`);
    } catch (error) {
      toast({ title: 'Failed to create template', variant: 'destructive' });
    }
  }, [navigate, toast]);

  const handleUseTemplate = useCallback(async (templateId: number) => {
    try {
      const document = await instantiateSignatureTemplate(templateId, {});
      navigate(`/documents/${document.id}`);
    } catch (error) {
      toast({ title: 'Failed to create document from template', variant: 'destructive' });
    }
  }, [navigate, toast]);

  const handleToggleExpand = (templateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTemplateId((prev) => (prev === templateId ? null : templateId));
  };

  const handleDelete = useCallback(async (templateId: number) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteSignatureTemplate(templateId);
      setTemplates((prev) => prev.filter((template) => template.id !== templateId));
      toast({ title: 'Template deleted' });
    } catch (error) {
      toast({ title: 'Failed to delete template', variant: 'destructive' });
    }
  }, [toast]);

  const headerActions = useMemo(() => (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => fetchTemplates()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
      <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleCreate()}>
        <Plus className="h-4 w-4 mr-2" />
        New Template
      </Button>
    </div>
  ), [fetchTemplates, handleCreate]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <FileSignature className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <span className="text-xl font-semibold italic uppercase tracking-wide truncate">Signature Templates</span>
        </div>
        <div className="hidden md:flex">{headerActions}</div>
      </div>
    );
    fetchTemplates();
    return () => setHeaderContent(null);
  }, [setHeaderContent, headerActions, fetchTemplates]);

  return (
    <>
      <MobileControlsBar>
        <div className="flex items-center gap-2 w-full">
          <Button size="icon" variant="outline" onClick={() => fetchTemplates()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 flex-1" onClick={() => handleCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </MobileControlsBar>
      <PageContainer>
        <PageSurface>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading...</div>
              ) : templates.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileSignature className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No templates yet</h3>
                  <p className="text-muted-foreground mb-4">Create a reusable template for signature requests.</p>
                  <Button onClick={() => handleCreate()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="h-4 w-4 mr-2" />Create Template
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {templates.map((template) => {
                    const isExpanded = expandedTemplateId === template.id;
                    return (
                      <div key={template.id}>
                        <div
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={(e) => handleToggleExpand(template.id, e)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-sky-100 dark:bg-sky-900">
                                <FileSignature className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                              </div>
                              <p className="font-medium text-sm md:text-base truncate">{template.title}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => handleToggleExpand(template.id, e)}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : 'transform rotate-180'}`} />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => navigate(`/templates/${template.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" />View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleUseTemplate(template.id)}>
                                    <Send className="h-4 w-4 mr-2" />Use
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(template.id)}
                                    className="text-destructive dark:text-red-400 focus:text-destructive focus:dark:text-red-300"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {template.file_url ? 'File attached' : 'No file'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">Created {new Date(template.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="bg-muted/30 border-t px-6 py-6">
                            <div className="max-w-3xl mx-auto space-y-4">
                              <div className="rounded-lg border bg-card p-4">
                                <h3 className="text-lg font-semibold">{template.title}</h3>
                                {template.description && (
                                  <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
                                )}
                                {template.message && (
                                  <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{template.message}</p>
                                )}
                              </div>

                              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4 pt-4 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/templates/${template.id}`);
                                  }}
                                  className="text-xs sm:text-sm"
                                >
                                  <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUseTemplate(template.id);
                                  }}
                                >
                                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                  Use Template
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive dark:text-red-400 border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus:text-destructive focus:dark:text-red-300 text-xs sm:text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(template.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </PageSurface>
      </PageContainer>
    </>
  );
}
