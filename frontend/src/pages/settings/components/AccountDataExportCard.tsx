import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import { useToast } from '@/hooks/use-toast';
import { getViewerDataExportViaGraphql } from '@/services/authGraphql';

export function AccountDataExportCard() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const downloadExport = async () => {
    setDownloading(true);
    try {
      const accountExport = await getViewerDataExportViaGraphql();
      const blob = new Blob([
        JSON.stringify({
          schemaVersion: accountExport.schemaVersion,
          generatedAt: accountExport.generatedAt,
          ...accountExport.data,
        }, null, 2),
      ], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = accountExport.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast({
        title: 'Account export downloaded',
        description: 'Keep this file somewhere private and secure.',
      });
    } catch (error) {
      toast({
        title: 'Could not export account data',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <SettingsSectionTitle icon={Download}>Portable account export</SettingsSectionTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Download a JSON copy of your profile, workspace memberships, and personal
            canvas content. Passwords, login tokens, and sharing capabilities are excluded.
          </p>
          <p>
            Vault values remain encrypted and still require the corresponding vault password
            or recovery secret.
          </p>
        </div>
        <Button variant="outline" onClick={() => void downloadExport()} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {downloading ? 'Preparing export...' : 'Download JSON export'}
        </Button>
      </CardContent>
    </Card>
  );
}
