import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureField } from '@/services/signaturesApi';
import { getAssetUrl, getApiUrl, getAuthToken } from '@/lib/api';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FieldPlacementCanvasProps {
  fields: SignatureField[];
  onChange: (fields: SignatureField[]) => void;
  fileUrl: string;
  roles?: string[];
  localFile?: File | null;
  documentId?: number;
  readOnly?: boolean;
}

const FIELD_TYPES: SignatureField['field_type'][] = ['signature', 'initials', 'text', 'date', 'checkbox'];

export default function FieldPlacementCanvas({
  fields,
  onChange,
  fileUrl,
  roles = [],
  localFile = null,
  documentId,
  readOnly = false
}: FieldPlacementCanvasProps) {
  const formatFieldType = (type: SignatureField['field_type']) => type.charAt(0).toUpperCase() + type.slice(1);
  const [fieldType, setFieldType] = useState<SignatureField['field_type']>('signature');
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(800);
  const [roleName, setRoleName] = useState<string>(roles[0] || '');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [previewPageCount, setPreviewPageCount] = useState(2);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const resolvedUrl = useMemo(() => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http') || fileUrl.startsWith('blob:')) return fileUrl;
    return getAssetUrl(fileUrl);
  }, [fileUrl]);

  const pdfFile = useMemo(() => {
    if (localFile) return localFile;
    if (!resolvedUrl) return '';
    if (resolvedUrl.startsWith(getApiUrl()) && resolvedUrl.includes('/uploads/')) return resolvedUrl;
    if (documentId) {
      const token = getAuthToken();
      return {
        url: `${getApiUrl()}/api/signatures/documents/${documentId}/file`,
        httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined
      };
    }
    return resolvedUrl;
  }, [localFile, resolvedUrl, documentId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPageWidth(Math.min(900, entry.contentRect.width));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (pageNumber > numPages) setPageNumber(numPages);
  }, [numPages, pageNumber]);

  useEffect(() => {
    if (!readOnly) return;
    setPreviewPageCount((prev) => Math.min(Math.max(prev, 1), numPages || 1));
  }, [numPages, readOnly]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>, targetPage: number) => {
    if (readOnly) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const newField: SignatureField = {
      id: Date.now(),
      document_id: 0,
      field_type: fieldType,
      page_number: targetPage,
      x_position: Number(x.toFixed(3)),
      y_position: Number(y.toFixed(3)),
      width: 20,
      height: 5,
      label: fieldType,
      role_name: roleName || undefined
    };

    onChange([...fields, newField]);
  };

  const removeField = (fieldId: number) => {
    if (readOnly) return;
    onChange(fields.filter((field) => field.id !== fieldId));
  };

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let current = 1;
    pageRefs.current.forEach((page, index) => {
      if (!page) return;
      const rect = page.getBoundingClientRect();
      if (rect.top - containerTop <= 10) {
        current = index + 1;
      }
    });
    setPageNumber(current);
  };

  const jumpToPage = (nextPage: number) => {
    const clamped = Math.min(numPages, Math.max(1, nextPage));
    setPageNumber(clamped);
    const page = pageRefs.current[clamped - 1];
    if (page && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: page.offsetTop - 16,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Field Type</Label>
            <Select value={fieldType} onValueChange={(value) => setFieldType(value as SignatureField['field_type'])}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Field type" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {roles.length > 0 && (
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={roleName} onValueChange={setRoleName}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Page</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={numPages}
                value={pageNumber}
                onChange={(e) => jumpToPage(Number(e.target.value))}
                className="w-[120px]"
              />
              <span className="text-sm text-muted-foreground">of {numPages}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Click on the canvas to place a field.
          </div>
        </div>
      )}

      <div className="w-full" ref={containerRef}>
        {!pdfFile && (
          <div className="flex items-center justify-center text-xs text-muted-foreground h-48">
            Upload a PDF to start placing fields.
          </div>
        )}
        {pdfFile && (
          <div
            ref={scrollRef}
            className="max-h-[70vh] overflow-y-auto space-y-6"
            onScroll={handleScroll}
          >
            <Document
              file={pdfFile}
              onLoadSuccess={(doc) => {
                setNumPages(doc.numPages);
                setLoadError(null);
              }}
              onLoadError={(error) => {
                setLoadError(error?.message || 'Failed to load PDF file');
              }}
              onSourceError={(error) => {
                setLoadError(error?.message || 'Failed to load PDF source');
              }}
              loading={<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading PDF...</div>}
              error={null}
            >
              {Array.from({ length: readOnly ? Math.min(numPages, previewPageCount) : numPages }, (_, index) => {
                const pageIndex = index + 1;
                return (
                  <div
                    key={`page-${pageIndex}`}
                    ref={(el) => {
                      pageRefs.current[index] = el;
                    }}
                    className="relative w-full border border-dashed border-muted-foreground/40 bg-white"
                    onClick={(event) => handleCanvasClick(event, pageIndex)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (!readOnly && event.key === 'Enter') handleCanvasClick(event as any, pageIndex);
                    }}
                  >
                    <Page
                      pageNumber={pageIndex}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    {fields
                      .filter((field) => field.page_number === pageIndex)
                      .map((field) => (
                        <div
                          key={field.id}
                          className={`absolute border text-[10px] px-1 ${selectedFieldId === field.id ? 'border-blue-600 bg-blue-200/60 text-blue-800' : 'border-blue-500 bg-blue-100/50 text-blue-700'}`}
                          style={{
                            left: `${field.x_position}%`,
                            top: `${field.y_position}%`,
                            width: `${field.width}%`,
                            height: `${field.height}%`
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedFieldId(field.id);
                          }}
                        >
                          {formatFieldType(field.field_type)}
                        </div>
                      ))}
                  </div>
                );
              })}
            </Document>
            {readOnly && numPages > previewPageCount && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewPageCount((prev) => Math.min(numPages, prev + 2))}
                >
                  Load more pages
                </Button>
              </div>
            )}
          </div>
        )}
        {loadError && (
          <div className="mt-3 text-xs text-red-500">
            {loadError}
          </div>
        )}
      </div>

      {fields.length > 0 && !readOnly && (
        <div className="space-y-2">
          <Label>Placed Fields</Label>
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="text-sm">
                  {formatFieldType(field.field_type)}
                  {field.role_name ? ` (${field.role_name})` : ''} on page {field.page_number}
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeField(field.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
