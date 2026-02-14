import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getPublicSigningData, submitPublicSignature, declinePublicSignature } from '@/services/signaturesApi';
import { getAssetUrl, getApiUrl } from '@/lib/api';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type FieldValueMap = Record<number, string>;

const SignatureCanvas = ({ onSave }: { onSave: (value: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    draw(e);
  };

  const endDraw = () => {
    setDrawing(false);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="border rounded-md w-full"
        onPointerDown={startDraw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
        onPointerMove={draw}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleSave}>
          Use Signature
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </div>
  );
};

const SIGNATURE_FONTS = [
  { label: 'Classic', value: 'cursive' },
  { label: 'Elegant', value: '"Brush Script MT", cursive' },
  { label: 'Modern', value: '"Segoe Script", cursive' }
];

const renderTypedSignature = (text: string, fontFamily: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `64px ${fontFamily}`;
  ctx.fillText(text, 20, canvas.height / 2);
  return canvas.toDataURL('image/png');
};

export default function SignPage() {
  const { token } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [fieldValues, setFieldValues] = useState<FieldValueMap>({});
  const [consent, setConsent] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(720);
  const [signatureValue, setSignatureValue] = useState<string | null>(null);
  const [initialsValue, setInitialsValue] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureType, setCaptureType] = useState<'signature' | 'initials'>('signature');
  const [captureFieldId, setCaptureFieldId] = useState<number | null>(null);
  const [typedValue, setTypedValue] = useState('');
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].value);
  const [uploadValue, setUploadValue] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicSigningData(token)
      .then((response) => {
        setData(response);
      })
      .catch(() => {
        toast({ title: 'Signing link invalid or expired', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [token, toast]);

  const fields = useMemo(() => data?.fields || [], [data]);
  const resolvedUrl = useMemo(() => {
    const url = data?.document?.file_url || '';
    if (!url) return '';
    if (url.startsWith('/uploads/')) return getAssetUrl(url);
    if (token) return `${getApiUrl()}/api/public/sign/${token}/file`;
    return url;
  }, [data, token]);

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

  const updateFieldValue = (fieldId: number, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const openCapture = (fieldId: number, type: 'signature' | 'initials') => {
    setCaptureFieldId(fieldId);
    setCaptureType(type);
    setTypedValue('');
    setUploadValue(null);
    setCaptureOpen(true);
  };

  const applyCaptureValue = (value: string) => {
    if (!captureFieldId) return;
    updateFieldValue(captureFieldId, value);
    if (captureType === 'signature') {
      setSignatureValue(value);
    } else {
      setInitialsValue(value);
    }
    setCaptureOpen(false);
  };

  const handleTypedApply = () => {
    if (!typedValue.trim()) return;
    const dataUrl = renderTypedSignature(typedValue.trim(), selectedFont);
    if (dataUrl) applyCaptureValue(dataUrl);
  };

  const handleUploadApply = () => {
    if (!uploadValue) return;
    applyCaptureValue(uploadValue);
  };

  const handleSubmit = async () => {
    if (!token) return;
    try {
      const requiredFields = fields.filter((field: any) => field.is_required);
      const missing = requiredFields.filter((field: any) => !fieldValues[field.id]);
      if (missing.length > 0) {
        toast({ title: 'Please complete all required fields', variant: 'destructive' });
        return;
      }
      await submitPublicSignature(token, {
        fields: fields.map((field: any) => ({
          id: field.id,
          value: fieldValues[field.id] || ''
        }))
      });
      toast({ title: 'Signature submitted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to submit signature', variant: 'destructive' });
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    try {
      await declinePublicSignature(token, 'Recipient declined');
      toast({ title: 'Signature declined' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to decline', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!data) {
    return <div className="p-6">Signing link invalid or expired.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{data.document.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.document.description}</p>
          <p className="text-sm mt-2">{data.document.message}</p>
          {data.document.file_url && (
            <a className="text-blue-600 text-sm mt-4 inline-block" href={resolvedUrl} target="_blank" rel="noreferrer">
              Download original PDF
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={containerRef} className="border rounded-md bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm">
              <span>Page</span>
              <Input
                type="number"
                min={1}
                max={numPages}
                value={pageNumber}
                onChange={(e) => jumpToPage(Number(e.target.value))}
                className="w-[120px]"
              />
              <span className="text-muted-foreground">of {numPages}</span>
            </div>
            {resolvedUrl && (
              <div
                ref={scrollRef}
                className="max-h-[70vh] overflow-y-auto space-y-6 pr-2"
                onScroll={handleScroll}
              >
                <Document
                  file={resolvedUrl}
                  onLoadSuccess={(doc) => setNumPages(doc.numPages)}
                  loading={<div className="p-4 text-sm text-muted-foreground">Loading PDF...</div>}
                >
                  {Array.from({ length: numPages }, (_, index) => {
                    const pageIndex = index + 1;
                    return (
                      <div
                        key={`page-${pageIndex}`}
                        ref={(el) => {
                          pageRefs.current[index] = el;
                        }}
                        className="relative w-full max-w-4xl mx-auto bg-white"
                      >
                        <Page
                          pageNumber={pageIndex}
                          width={pageWidth}
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                        />
                        {fields
                          .filter((field: any) => field.page_number === pageIndex)
                          .map((field: any) => (
                            <button
                              key={field.id}
                              type="button"
                              className={`absolute border text-[10px] px-1 bg-white/70 ${selectedFieldId === field.id ? 'border-blue-600 text-blue-700' : 'border-blue-300 text-blue-500'}`}
                              style={{
                                left: `${field.x_position}%`,
                                top: `${field.y_position}%`,
                                width: `${field.width}%`,
                                height: `${field.height}%`
                              }}
                              onClick={() => {
                                setSelectedFieldId(field.id);
                                if (field.field_type === 'signature' || field.field_type === 'initials') {
                                  openCapture(field.id, field.field_type);
                                }
                              }}
                            >
                              {field.label || field.field_type}
                            </button>
                          ))}
                      </div>
                    );
                  })}
                </Document>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {fields.filter((field: any) => fieldValues[field.id]).length} / {fields.length} fields completed
          </div>
          {fields.map((field: any) => (
            <div key={field.id} className="space-y-2">
              <div className="text-sm font-medium">
                {field.label || field.field_type}
                {field.is_required ? ' *' : ''}
              </div>
              {field.field_type === 'signature' || field.field_type === 'initials' ? (
                <div className="space-y-2">
                  {fieldValues[field.id] ? (
                    <img src={fieldValues[field.id]} alt="Signature preview" className="max-h-24 border rounded-md bg-white" />
                  ) : (
                    <div className="text-xs text-muted-foreground">No signature captured yet.</div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => openCapture(field.id, field.field_type)}>
                    Add {field.field_type === 'initials' ? 'Initials' : 'Signature'}
                  </Button>
                  {(field.field_type === 'signature' ? signatureValue : initialsValue) && !fieldValues[field.id] && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applyCaptureValue(field.field_type === 'signature' ? signatureValue! : initialsValue!)}
                    >
                      Use saved {field.field_type === 'initials' ? 'initials' : 'signature'}
                    </Button>
                  )}
                </div>
              ) : null}
              {field.field_type === 'text' && (
                <Textarea value={fieldValues[field.id] || ''} onChange={(e) => updateFieldValue(field.id, e.target.value)} />
              )}
              {field.field_type === 'date' && (
                <Input type="date" value={fieldValues[field.id] || ''} onChange={(e) => updateFieldValue(field.id, e.target.value)} />
              )}
              {field.field_type === 'checkbox' && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={fieldValues[field.id] === 'true'}
                    onCheckedChange={(checked) => updateFieldValue(field.id, checked ? 'true' : 'false')}
                  />
                  <span className="text-sm">I agree</span>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Checkbox checked={consent} onCheckedChange={(checked) => setConsent(Boolean(checked))} />
            <span className="text-sm">I agree to sign electronically.</span>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!consent}>
              Complete Signing
            </Button>
            <Button variant="outline" onClick={handleDecline}>
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{captureType === 'initials' ? 'Add Initials' : 'Add Signature'}</DialogTitle>
            <DialogDescription>
              Draw, type, or upload your {captureType === 'initials' ? 'initials' : 'signature'}.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="draw">
            <TabsList className="w-full">
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="space-y-4">
              <SignatureCanvas onSave={applyCaptureValue} />
            </TabsContent>
            <TabsContent value="type" className="space-y-4">
              <Input
                placeholder={captureType === 'initials' ? 'Enter initials' : 'Enter full name'}
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {SIGNATURE_FONTS.map((font) => (
                  <Button
                    key={font.value}
                    type="button"
                    variant={selectedFont === font.value ? 'default' : 'outline'}
                    onClick={() => setSelectedFont(font.value)}
                  >
                    {font.label}
                  </Button>
                ))}
              </div>
              <div className="border rounded-md bg-muted/30 p-4 text-3xl" style={{ fontFamily: selectedFont }}>
                {typedValue || (captureType === 'initials' ? 'AB' : 'Alex Baker')}
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleTypedApply} disabled={!typedValue.trim()}>
                  Use {captureType === 'initials' ? 'Initials' : 'Signature'}
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setUploadValue(String(reader.result || ''));
                  reader.readAsDataURL(file);
                }}
              />
              {uploadValue && (
                <img src={uploadValue} alt="Uploaded signature" className="max-h-32 border rounded-md bg-white" />
              )}
              <DialogFooter>
                <Button type="button" onClick={handleUploadApply} disabled={!uploadValue}>
                  Use Uploaded {captureType === 'initials' ? 'Initials' : 'Signature'}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
