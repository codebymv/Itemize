import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthState } from '@/contexts/AuthContext';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { useHeader } from '@/contexts/HeaderContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PricingCards } from '@/components/subscription';
import { SubscriptionStatus } from '@/components/subscription/SubscriptionStatus';
import { Plan } from '@/lib/subscription';
import {
  Settings,
  User,
  Wrench,
  Sparkles,
  Sun,
  Moon,
  CreditCard,
  Building,
  Loader2,
} from 'lucide-react';
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

// Settings navigation items
const settingsNav = [
  { title: 'Account', path: '/settings', icon: User },
  { title: 'Preferences', path: '/preferences', icon: Wrench },
  { title: 'Payments', path: '/payment-settings', icon: CreditCard },
];

function SettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname === '/settings/' ? '/settings' : location.pathname;

  // Mobile: Use tabs
  const mobileTabs = (
    <Tabs value={activePath} onValueChange={(value) => navigate(value)} className="w-full md:hidden">
      <TabsList className="grid w-full grid-cols-3 mb-4">
        {settingsNav.map((item) => {
          const isActive = activePath === item.path || (item.path === '/settings' && activePath === '/settings/');
          return (
            <TabsTrigger 
              key={item.path} 
              value={item.path}
              className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3 text-muted-foreground group/item"
            >
              <item.icon className={cn(
                "h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 transition-colors group-hover/item:text-blue-600",
                isActive ? "text-blue-600" : "text-gray-600 dark:text-gray-400"
              )} />
              <span className="hidden sm:inline">{item.title}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );

  // Desktop: Use sidebar navigation
  const desktopNav = (
    <nav className="hidden md:flex flex-col gap-1">
      {settingsNav.map((item) => {
        const isActive = location.pathname === item.path || (item.path === '/settings' && location.pathname === '/settings/');
        return (
          <Button
            key={item.path}
            variant={isActive ? 'secondary' : 'ghost'}
            className="justify-start text-muted-foreground hover:text-foreground font-raleway group/item"
            onClick={() => navigate(item.path)}
          >
            <item.icon
              className={cn(
                "mr-2 h-4 w-4 transition-colors text-gray-600 dark:text-gray-400 group-hover/item:text-blue-600",
                isActive ? 'text-blue-600' : ''
              )}
            />
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

function AccountInfo({ currentPlan }: { currentPlan?: Plan }) {
  const { currentUser } = useAuthState();
  const { startCheckout } = useSubscriptionFeatures();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async (planId: Plan) => {
    if (currentPlan === planId) return;

    setIsLoading(true);
    try {
      await startCheckout(planId, billingPeriod);
    } catch (error) {
      console.error('Failed to start checkout:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-medium flex-shrink-0">
              {currentUser?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-center sm:text-left min-w-0 flex-1">
              <p className="font-medium break-words">{currentUser?.name || 'User'}</p>
              <p className="text-sm text-muted-foreground break-all sm:break-words">{currentUser?.email}</p>
            </div>
          </div>

          <Separator />

          <SubscriptionStatus />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Plans</CardTitle>
          <CardDescription>Choose the plan that works best for you</CardDescription>
        </CardHeader>
        <CardContent>
          <PricingCards
            variant="dashboard"
            currentPlan={currentPlan}
            onUpgrade={handleUpgrade}
            isLoading={isLoading}
            showYearlyToggle={true}
            billingPeriod={billingPeriod}
            onBillingPeriodChange={setBillingPeriod}
          />
        </CardContent>
      </Card>
    </div>
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
  const [businessToDelete, setBusinessToDelete] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteClick = (business: any) => {
    setBusinessToDelete(business);
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
    const inputRef = (document.querySelector('input[type="file"]') as HTMLInputElement);
    if (inputRef) {
      inputRef.value = '';
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
        settings={settings!}
        taxRateInput={taxRateInput}
        updateField={updateField!}
        setTaxRateInput={setTaxRateInput!}
      />

      <BusinessProfileCard
        businesses={businesses!}
        loading={loading}
        onAddBusiness={openBusinessDialog}
        onEditBusiness={openBusinessDialog}
        onDeleteBusiness={handleDeleteClick}
      />

      <BusinessFormDialog
        open={businessDialogOpen!}
        onOpenChange={setBusinessDialogOpen!}
        editingBusiness={editingBusiness}
        formData={businessFormData!}
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
        itemName={businessToDelete?.name}
        description={`Are you sure you want to delete "${businessToDelete?.name}"? This action cannot be undone.`}
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
            {activeNavItem.title}
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