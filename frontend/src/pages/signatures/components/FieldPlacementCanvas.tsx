import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureField } from '@/services/signaturesApi';

interface FieldPlacementCanvasProps {
  fields: SignatureField[];
  onChange: (fields: SignatureField[]) => void;
  fileUrl: string;
  roles?: string[];
}

const FIELD_TYPES: SignatureField['field_type'][] = ['signature', 'initials', 'text', 'date', 'checkbox'];

export default function FieldPlacementCanvas({ fields, onChange, fileUrl, roles = [] }: FieldPlacementCanvasProps) {
  const [fieldType, setFieldType] = useState<SignatureField['field_type']>('signature');
  const [pageNumber, setPageNumber] = useState(1);
  const [roleName, setRoleName] = useState<string>(roles[0] || '');

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const newField: SignatureField = {
      id: Date.now(),
      document_id: 0,
      field_type: fieldType,
      page_number: pageNumber,
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
    onChange(fields.filter((field) => field.id !== fieldId));
  };

  return (
    <div className="space-y-4">
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
                  {type}
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
          <Input
            type="number"
            min={1}
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
            className="w-[120px]"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Click on the canvas to place a field.
        </div>
      </div>

      <div className="border rounded-md bg-muted/30 p-4">
        <div
          className="relative w-full max-w-3xl mx-auto aspect-[3/4] border border-dashed border-muted-foreground/40 bg-white"
          onClick={handleCanvasClick}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleCanvasClick(event as any);
          }}
        >
          {fileUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              PDF preview will render here in a future iteration.
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Upload a PDF to start placing fields.
            </div>
          )}
          {fields.map((field) => (
            <div
              key={field.id}
              className="absolute border border-blue-500 bg-blue-100/50 text-[10px] text-blue-700 px-1"
              style={{
                left: `${field.x_position}%`,
                top: `${field.y_position}%`,
                width: `${field.width}%`,
                height: `${field.height}%`
              }}
            >
              {field.field_type}
            </div>
          ))}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          <Label>Placed Fields</Label>
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="text-sm">
                  {field.field_type} {field.role_name ? `(${field.role_name})` : ''} on page {field.page_number} at ({field.x_position}, {field.y_position})
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
