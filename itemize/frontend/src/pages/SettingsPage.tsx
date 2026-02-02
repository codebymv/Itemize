import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { useHeader } from '@/contexts/HeaderContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { save } from '@turbopack/ts-utils';
import type { Plan } from '@/lib/subscription';
import { type Plan, PLAN_METADATA } from '@/lib/subscription';
import {
  Settings,
  User,
  Wrench,
  Sparkles,
  Sun,
  Moon,
  Loader2,
} from 'lucide-react';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { 
  getPaymentSettings, 
} from '@/services/invoicesApi';
import { getAssetUrl } from '@/lib/api';
import { MobileControlsBar } from '@/components/MobileControlsBar';

// Refactored hooks and components
import { 
  usePaymentSettings, 
  useBusinessManagement 
} from './settings';
import { 
  PaymentSettingsForm,
  BusinessProfileCard,
  BusinessFormDialog,
  DeleteConfirmDialog 
} from './settings';
import { AccountInfo } from '@/components/subscription/AccountInfo';

// Settings navigation items
const settingsNav = [
  { title: 'Account', path: '/settings', icon: User },
  { title: 'Preferences', path: '/preferences', icon: Wrench },
  { title: 'Payments', path: '/payment-settings', icon: Settings },
];

function SettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname === '/settings/' ? '/settings' : location.pathname;

  // Mobile: Use tabs
  const mobileTabs = (
    <div className="flex border-b md:hidden">
      {settingsNav.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          className={`flex-1 flex-col items-center gap-1 py-2 text-sm font-medium font-raleway transition-colors ${
            activePath === item.path || (item.path === '/settings' && location.pathname === '/settings/')
              ? 'text-foreground border-b-2 border-blue-600'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <item.icon className="h-4 w-4 flex-shrink-0" />
          <span className="hidden xs:inline">{item.title}</span>
        </button>
      ))}
    </div>
  );

  // Desktop: Use sidebar navigation
  const desktopNav = (
    <nav className="hidden md:flex flex-col gap-1">
      {settingsNav.map((item) => {
        const isActive = location.pathname === item.path ||
          (item.path === '/settings' && location.pathname === '/settings/');
        return (
          <Button
            key={item.path}
            variant={isActive ? 'secondary' : 'ghost'}
            className="justify-start text-muted-foreground hover:text-foreground font-raleway"
            onClick={() => navigate(item.path)}
          >
            <item.icon className={`mr-2 h-4 w-4 ${isActive ? 'text-blue-600' : ''}`} />
            {item.title}
          </Button>
        );
      })}
    </nav>
  );

  return (
    <>
      {mobileTabs}
      {desktopNav}
    </>
  );
}

function AccountSettings() {
  const { planName } = useSubscriptionState();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Account</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account information and subscription
        </p>
      </div>
      <Separator />
      
      <AccountInfo currentPlan={planName as Plan | undefined} />
    </div>
  );
}

function PreferencesSettings() {
  const { theme, setTheme } = useTheme();
  const { aiEnabled, setAiEnabled } = useAISuggest();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Customize your experience
        </p>
      </div>
      <Separator />
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Select your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              className={`flex-1 ${theme === 'light' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun className="mr-2 h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              className={`flex-1 ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Features</CardTitle>
          <CardDescription>
            Get smart suggestions for list items, note content, and more
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <Label htmlFor="ai-toggle">Enable AI Enhancements</Label>
            </div>
            <Switch
              id="ai-toggle"
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentsSettings({ setSaveButton }: { setSaveButton?: (button: React.ReactNode) => void }) {
  const { organizationId } = useOrganization();

  const {
    loading,
    saving,
    settings,
    taxRateInput,
    handleSaveSettings,
    updateField,
    setTaxRateInput,
  } = usePaymentSettings();

  const {
    businesses,
    savingBusiness,
    uploadingLogo,
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    fetchData,
    openBusinessDialog,
    closeBusinessDialog,
    handleSaveBusiness,
    handleDeleteBusiness,
    handleBusinessLogoUpload,
    setBusinessDialogOpen,
    setBusinessFormData,
    setPendingLogoFile,
  } = useBusinessManagement();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [businessToDelete, setBusinessToDelete] = useState< ReturnType<typeof useBusinessManagement>['editingBusiness'] | null>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Setup save button in header
  useEffect(() => {
    if (!organizationId || loading) return;
    if (setSaveButton) {
      setSaveButton(
        <Button onClick={handleSaveSettings} disabled={saving}>
          {saving ? 'Saving...' : <><save className="h-4 w-4 mr-2" />Save</>}
        </Button>
      );
    }
    return () => {
      if (setSaveButton) {
        setSaveButton(null);
      }
    };
  }, [saving, setSaveButton, loading, handleSaveSettings, organizationId]);

  const handleDeleteClick = (business: Parameters<typeof Set<number>>[0]) => {
    setBusinessToDelete(business as any);
    setDeleteDialogOpen(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setBusinessFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleRemoveLogo = () => {
    if (businessFormData?.logo_url?.startsWith('blob:')) {
      URL.revokeObjectURL(businessFormData.logo_url);
    }
    setPendingLogoFile(null);
    setBusinessFormData((prev: any) => ({ ...prev, logo_url: '' }));
    if (editingBusiness && (businessFileInputRef as any)?.current) {
      (businessFileInputRef as any).current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Payments</h3>
          <p className="text-sm text-muted-foreground">
            Configure invoicing and payment settings
          </p>
        </div>
        <Separator />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Payments</h3>
        <p className="text-sm text-muted-foreground">
          Configure invoicing and payment settings
        </p>
      </div>
      <Separator />

      <PaymentSettingsForm
        settings={settings}
        taxRateInput={taxRateInput}
        updateField={updateField}
        setTaxRateInput={setTaxRateInput}
      />

      <BusinessProfileCard
        businesses={businesses}
        loading={loading}
        onAddBusiness={openBusinessDialog}
        onEditBusiness={openBusinessDialog}
        onDeleteBusiness={handleDeleteClick}
      />

      <BusinessFormDialog
        open={businessDialogOpen}
        onOpenChange={setBusinessDialogOpen}
        editingBusiness={editingBusiness}
        formData={businessFormData as any}
        saving={savingBusiness}
        uploadingLogo={uploadingLogo}
        pendingLogoFile={pendingLogoFile}
        onSave={handleSaveBusiness}
        onLogoUpload={handleBusinessLogoUpload}
        onRemoveLogo={handleRemoveLogo}
        onCancel={closeBusinessDialog}
        onFormChange={handleFormChange}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Business"
        itemName={(businessToDelete as any)?.name}
        description={`Are you sure you want to delete "${(businessToDelete as any)?.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteBusiness}
      />
    </div>
  );
}

export function SettingsPage() {
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();
  const location = useLocation();
  const [saveButton, setSaveButton] = useState<React.ReactNode>(null);

  const activeNavItem = settingsNav.find(item => item.path === location.pathname) || settingsNav[0];

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0 flex-1">
          <Settings className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1
            className="text-base sm:text-xl font-semibold italic truncate"
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            <span className="hidden sm:inline">SETTINGS | </span>{activeNavItem.title}
          </h1>
        </div>
        {saveButton && <div className="hidden md:flex items-center gap-2 mr-4">{saveButton}</div>}
      </div>
    );
    return () => setHeaderContent(null);
  }, [theme, setHeaderContent, activeNavItem.title, saveButton]);

  return (
    <>
      {saveButton && (
        <MobileControlsBar>
          <div className="flex-1">{saveButton}</div>
        </MobileControlsBar>
      )}
      <div className="container mx-auto p-4 sm:p-6 max-w-8xl">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <SettingsNav />

          <div className="min-w-0 flex-1" key={location.pathname}>
            {location.pathname === '/preferences' && <PreferencesSettings />}
            {location.pathname === '/payment-settings' && <PaymentsSettings setSaveButton={setSaveButton} />}
            {location.pathname === '/settings' && <AccountSettings />}
          </div>
        </div>
      </div>
    </>
  );
}

export default SettingsPage;