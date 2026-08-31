import { UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import { AccountDataExportAction } from './AccountDataExportCard';
import { AccountDeletionAction } from './AccountDeletionCard';

export function ManageAccountCard() {
  return (
    <Card>
      <CardHeader>
        <SettingsSectionTitle icon={UserCog}>Manage account</SettingsSectionTitle>
      </CardHeader>
      <CardContent surface="inset">
        <div className="grid gap-5 md:grid-cols-2 md:gap-0">
          <div className="md:pr-6">
            <AccountDataExportAction />
          </div>
          <div className="border-t pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <AccountDeletionAction />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
