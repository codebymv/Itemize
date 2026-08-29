import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsInfoTooltip } from '@/components/settings/SettingsPrimitives';
import { useToast } from '@/hooks/use-toast';
import { getViewerDataExportViaGraphql } from '@/services/authGraphql';

export function AccountDataExportAction() {
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
    <section className="space-y-3" aria-labelledby="account-export-title">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <h3 id="account-export-title" className="text-sm font-medium">JSON export</h3>
          <SettingsInfoTooltip label="What is included in the JSON export?">
            Includes your profile, memberships, personal Workspace content, and records from
            organizations you own. Passwords, login tokens, provider secrets, and sharing access
            are excluded. Vault values remain encrypted.
          </SettingsInfoTooltip>
        </div>
        <p className="text-sm text-muted-foreground">
          Download your account and eligible organization data.
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
    </section>
  );
}
