import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getPublicSigningData, submitPublicSignature, declinePublicSignature } from '@/services/signaturesApi';

type FieldValueMap = Record<number, string>;

const SignatureCanvas = ({ onSave }: { onSave: (value: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    draw(e);
  };

  const endDraw = () => {
    setDrawing(false);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
        onMouseDown={startDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onMouseMove={draw}
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

export default function SignPage() {
  const { token } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [fieldValues, setFieldValues] = useState<FieldValueMap>({});
  const [consent, setConsent] = useState(false);

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

  const updateFieldValue = (fieldId: number, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
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
      toast({ title: 'Failed to submit signature', variant: 'destructive' });
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    try {
      await declinePublicSignature(token, 'Recipient declined');
      toast({ title: 'Signature declined' });
    } catch (error) {
      toast({ title: 'Failed to decline', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!data) {
    return <div className="p-6">Signing link invalid or expired.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{data.document.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.document.description}</p>
          <p className="text-sm mt-2">{data.document.message}</p>
          {data.document.file_url && (
            <a className="text-blue-600 text-sm mt-4 inline-block" href={data.document.file_url} target="_blank" rel="noreferrer">
              Download original PDF
            </a>
          )}
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
                <SignatureCanvas onSave={(value) => updateFieldValue(field.id, value)} />
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
    </div>
  );
}
