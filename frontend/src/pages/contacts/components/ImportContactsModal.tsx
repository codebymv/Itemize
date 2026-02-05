import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { importContactsCSV, ImportContactData, ImportResult } from '@/services/contactsApi';
import { useToast } from '@/hooks/use-toast';

interface ImportContactsModalProps {
    organizationId: number;
    onClose: () => void;
    onImported: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'complete';

export function ImportContactsModal({ organizationId, onClose, onImported }: ImportContactsModalProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<Step>('upload');
    const [fileName, setFileName] = useState<string>('');
    const [parsedData, setParsedData] = useState<ImportContactData[]>([]);
    const [skipDuplicates, setSkipDuplicates] = useState(true);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Parse CSV string to array of objects
    const parseCSV = useCallback((csvText: string): ImportContactData[] => {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];

        // Parse headers (first row)
        const headers = lines[0].split(',').map(h =>
            h.trim().toLowerCase().replace(/["']/g, '').replace(/\s+/g, '_')
        );

        // Map common header variations to expected field names
        const headerMap: Record<string, keyof ImportContactData> = {
            'first_name': 'first_name',
            'firstname': 'first_name',
            'first': 'first_name',
            'last_name': 'last_name',
            'lastname': 'last_name',
            'last': 'last_name',
            'email': 'email',
            'email_address': 'email',
            'phone': 'phone',
            'phone_number': 'phone',
            'mobile': 'phone',
            'company': 'company',
            'company_name': 'company',
            'organization': 'company',
            'job_title': 'job_title',
            'jobtitle': 'job_title',
            'title': 'job_title',
            'position': 'job_title',
            'street': 'street',
            'address': 'street',
            'street_address': 'street',
            'city': 'city',
            'state': 'state',
            'province': 'state',
            'zip': 'zip',
            'zipcode': 'zip',
            'zip_code': 'zip',
            'postal_code': 'zip',
            'country': 'country',
            'status': 'status',
            'tags': 'tags',
        };

        // Parse data rows
        const data: ImportContactData[] = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle quoted values with commas inside
            const values: string[] = [];
            let current = '';
            let inQuotes = false;
            for (const char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());

            const row: ImportContactData = {};
            headers.forEach((header, index) => {
                const mappedField = headerMap[header];
                if (mappedField && values[index]) {
                    (row as any)[mappedField] = values[index].replace(/^["']|["']$/g, '');
                }
            });

            // Only add rows with at least some data
            if (row.first_name || row.last_name || row.email || row.company) {
                data.push(row);
            }
        }

        return data;
    }, []);

    // Handle file selection
    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const data = parseCSV(text);

                if (data.length === 0) {
                    setError('No valid contacts found in CSV. Please ensure the file has headers and data rows.');
                    return;
                }

                setParsedData(data);
                setStep('preview');
            } catch (err) {
                setError('Failed to parse CSV file. Please ensure it is a valid CSV format.');
            }
        };
        reader.onerror = () => {
            setError('Failed to read file. Please try again.');
        };
        reader.readAsText(file);
    }, [parseCSV]);

    // Handle import
    const handleImport = async () => {
        setStep('importing');
        setError(null);

        try {
            const result = await importContactsCSV(parsedData, organizationId, skipDuplicates);
            setImportResult(result);
            setStep('complete');

            if (result.imported > 0) {
                toast({
                    title: 'Import Complete',
                    description: `Successfully imported ${result.imported} contacts`,
                });
                onImported();
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to import contacts. Please try again.');
            setStep('preview');
        }
    };

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer.files?.[0];
        if (file && file.type === 'text/csv') {
            // Create a synthetic event to reuse handleFileSelect
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            if (fileInputRef.current) {
                fileInputRef.current.files = dataTransfer.files;
                handleFileSelect({ target: { files: dataTransfer.files } } as any);
            }
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                        Import Contacts from CSV
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        {step === 'upload' && 'Upload a CSV file with contact information'}
                        {step === 'preview' && 'Review the contacts before importing'}
                        {step === 'importing' && 'Importing contacts...'}
                        {step === 'complete' && 'Import completed'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto py-4">
                    {/* Upload step */}
                    {step === 'upload' && (
                        <div
                            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-lg font-medium mb-2">Drop your CSV file here</p>
                            <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                            <Button variant="outline" className="pointer-events-none">
                                Select File
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    )}

                    {/* Preview step */}
                    {step === 'preview' && parsedData.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    File: <span className="font-medium text-foreground">{fileName}</span>
                                </span>
                                <span className="text-muted-foreground">
                                    <span className="font-medium text-foreground">{parsedData.length}</span> contacts found
                                </span>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead>Company</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {parsedData.slice(0, 5).map((contact, i) => (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                                                </TableCell>
                                                <TableCell>{contact.email || '—'}</TableCell>
                                                <TableCell>{contact.phone || '—'}</TableCell>
                                                <TableCell>{contact.company || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {parsedData.length > 5 && (
                                    <div className="px-4 py-2 text-sm text-muted-foreground bg-muted/50 border-t">
                                        ... and {parsedData.length - 5} more contacts
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="skipDuplicates"
                                    checked={skipDuplicates}
                                    onCheckedChange={(checked) => setSkipDuplicates(!!checked)}
                                />
                                <Label htmlFor="skipDuplicates" className="text-sm cursor-pointer">
                                    Skip contacts with duplicate email addresses
                                </Label>
                            </div>
                        </div>
                    )}

                    {/* Importing step */}
                    {step === 'importing' && (
                        <div className="py-8 text-center">
                            <Spinner size="xl" variant="brand" className="mx-auto mb-4" />
                            <p className="text-muted-foreground">Importing {parsedData.length} contacts...</p>
                        </div>
                    )}

                    {/* Complete step */}
                    {step === 'complete' && importResult && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                                <div>
                                    <p className="font-medium">Import Complete</p>
                                    <p className="text-sm text-muted-foreground">
                                        {importResult.imported} imported, {importResult.skipped} skipped
                                    </p>
                                </div>
                            </div>

                            {importResult.errors.length > 0 && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        {importResult.errors.length} row(s) had errors and were not imported.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Error display */}
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter>
                    {step === 'upload' && (
                        <Button variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">Cancel</Button>
                    )}
                    {step === 'preview' && (
                        <>
                            <Button variant="outline" onClick={() => { setStep('upload'); setParsedData([]); }} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Back to upload">
                                Back
                            </Button>
                            <Button onClick={handleImport} className="bg-blue-600 hover:bg-blue-700 text-white" style={{ fontFamily: '"Raleway", sans-serif' }} aria-label={`Import ${parsedData.length} contacts`}>
                                Import {parsedData.length} Contacts
                            </Button>
                        </>
                    )}
                    {step === 'complete' && (
                        <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white" style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Close">Done</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ImportContactsModal;
