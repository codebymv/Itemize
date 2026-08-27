import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthState } from '@/contexts/AuthContext';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { IconTabsList, IconTabsTrigger, Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  getReduceMotionPreference,
  getStartPagePreference,
  setReduceMotionPreference,
  setStartPagePreference,
  type StartPagePreference,
} from '@/lib/userPreferences';
import { PricingCards } from '@/components/subscription';
import { SubscriptionStatus } from '@/components/subscription/SubscriptionStatus';
import { CheckoutSuccessModal } from '@/components/subscription/CheckoutSuccessModal';
import { Plan, shouldStartSoloTrial } from '@/lib/subscription';
import { TrialStatusCard } from '@/components/trial/TrialStatusCard';
import { UsageIndicator, UsageIndicatorGrid } from '@/components/trial/UsageIndicator';
import { useUsageStats } from '@/hooks/useUsageStats';
import { Mail, MessageSquare, Code2 } from 'lucide-react';
import {
  User,
  Wrench,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Lightbulb,
  Accessibility,
  LogIn,
  CreditCard,
  Building,
  Loader2,
  Plug,
  Gauge,
  Layers3,
} from 'lucide-react';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
// Refactored hooks and components
import { usePaymentsTab } from './settings/hooks/usePaymentsTab';
import {
  PaymentSettingsForm,
  BusinessProfileCard,
  BusinessFormDialog,
  DeleteConfirmDialog
} from './settings';
import { PaymentsTabLoadingSkeleton, PaymentsTabErrorState } from './settings/components/PaymentsTabLoadingStates';
import {
  integrationOAuthToast,
  readIntegrationOAuthResult,
} from '@/lib/integrationOAuthReturn';
import { disconnectStripeConnect, initiateStripeConnect } from '@/services/stripeConnectApi';
import { AccountDataExportCard } from './settings/components/AccountDataExportCard';
import { AccountDeletionCard } from './settings/components/AccountDeletionCard';
const OrganizationSettings = React.lazy(() =>
  import('./settings/OrganizationSettings').then((module) => ({
    default: module.OrganizationSettings,
  })),
);
const IntegrationsSettings = React.lazy(() =>
  import('./calendar-integrations/CalendarIntegrationsPage').then((module) => ({
    default: module.CalendarIntegrationsPage,
  })),
);

// Settings navigation items
const settingsNav = [
  { title: 'Account', path: '/settings', icon: User },
  { title: 'Organization', path: '/organization-settings', icon: Building },
  { title: 'Preferences', path: '/preferences', icon: Wrench },
  { title: 'Payments', path: '/payment-settings', icon: CreditCard },
  { title: 'Integrations', path: '/settings/integrations', icon: Plug },
];

function SettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname === '/settings/' ? '/settings' : location.pathname;

  // Mobile: Use tabs
  const mobileTabs = (
    <Tabs value={activePath} onValueChange={(value) => navigate(value)} className="w-full lg:hidden">
      <IconTabsList className="grid w-full grid-cols-5">
        {settingsNav.map((item) => (
          <IconTabsTrigger
            key={item.path}
            value={item.path}
            className="px-2 text-xs sm:px-3 sm:text-sm"
          >
            <item.icon className="h-3.5 w-3.5 flex-shrink-0 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{item.title}</span>
          </IconTabsTrigger>
        ))}
      </IconTabsList>
    </Tabs>
  );

  // Desktop: Use sidebar navigation
  const desktopNav = (
    <nav className="hidden flex-col gap-1 lg:flex">
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
                "mr-2 h-4 w-4 transition-colors group-hover/item:text-blue-600",
                isActive ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'
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

function AccountInfo({
  currentPlan,
  starterTrialEligible,
  canSubscribeCurrentTrial,
}: {
  currentPlan?: Plan;
  starterTrialEligible: boolean;
  canSubscribeCurrentTrial: boolean;
}) {
  const { currentUser } = useAuthState();
  const { startCheckout, startSoloTrial } = useSubscriptionFeatures();
  const { toast } = useToast();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const { data: usageStats } = useUsageStats();

  const handleUpgrade = async (planId: Plan) => {
    if (planId === 'free') return;
    if (currentPlan === planId && !canSubscribeCurrentTrial) return;

    setIsLoading(true);
    try {
      if (shouldStartSoloTrial(currentPlan, planId, starterTrialEligible)) {
        await startSoloTrial();
        toast({
          title: 'Solo trial started',
          description: 'Your business tools are unlocked for 14 days.',
        });
      } else {
        await startCheckout(planId, billingPeriod);
      }
    } catch (error) {
      toast({
        title: 'Could not change plan',
        description: error instanceof Error ? error.message : 'Failed to change plan',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trial Status Card - Shows only during active trial */}
      <TrialStatusCard />

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={User}>Account Information</SettingsSectionTitle>
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

      {/* Usage Statistics */}
      {usageStats && (
        <Card>
          <CardHeader>
            <SettingsSectionTitle icon={Gauge}>Current Usage</SettingsSectionTitle>
          </CardHeader>
          <CardContent>
            <UsageIndicatorGrid>
              <UsageIndicator
                resourceType="emails"
                used={usageStats.usage.emails.used}
                limit={typeof usageStats.usage.emails.limit === 'number' ? usageStats.usage.emails.limit : -1}
                label="Emails"
                icon={<Mail className="h-5 w-5" />}
              />
              <UsageIndicator
                resourceType="sms"
                used={usageStats.usage.sms.used}
                limit={typeof usageStats.usage.sms.limit === 'number' ? usageStats.usage.sms.limit : -1}
                label="SMS"
                icon={<MessageSquare className="h-5 w-5" />}
              />
              <UsageIndicator
                resourceType="apiCalls"
                used={usageStats.usage.apiCalls.used}
                limit={typeof usageStats.usage.apiCalls.limit === 'number' ? usageStats.usage.apiCalls.limit : -1}
                label="API Calls"
                icon={<Code2 className="h-5 w-5" />}
              />
            </UsageIndicatorGrid>
          </CardContent>
        </Card>
      )}

      <AccountDataExportCard />

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Layers3}>Available Plans</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <PricingCards
            variant="dashboard"
            currentPlan={currentPlan}
            starterTrialEligible={starterTrialEligible}
            canSubscribeCurrentTrial={canSubscribeCurrentTrial}
            onUpgrade={handleUpgrade}
            isLoading={isLoading}
            showYearlyToggle={false}
            billingPeriod={billingPeriod}
            onBillingPeriodChange={setBillingPeriod}
          />
        </CardContent>
      </Card>

      <AccountDeletionCard />
    </div>
  );
}

function AccountSettings() {
  const { planName, subscription } = useSubscriptionState();
  const starterTrialEligible = Boolean(subscription?.trialEligible);
  const canSubscribeCurrentTrial =
    planName === 'starter' &&
    subscription?.status === 'trialing' &&
    !subscription.hasSubscription;

  return (
    <div className="flex flex-col gap-6">
      <AccountInfo
        currentPlan={planName as Plan | undefined}
        starterTrialEligible={starterTrialEligible}
        canSubscribeCurrentTrial={canSubscribeCurrentTrial}
      />
    </div>
  );
}

function PreferencesSettings() {
  const { theme, setTheme } = useTheme();
  const { aiEnabled, setAiEnabled } = useAISuggest();
  const { isSubscribed } = useSubscriptionState();
  const [reduceMotion, setReduceMotion] = useState(getReduceMotionPreference);
  const [startPage, setStartPage] = useState<StartPagePreference>(getStartPagePreference);

  const handleReduceMotionChange = (enabled: boolean) => {
    setReduceMotion(enabled);
    setReduceMotionPreference(enabled);
  };

  const handleStartPageChange = (value: StartPagePreference) => {
    setStartPage(value);
    setStartPagePreference(value);
  };

  const startPageDescription: Record<StartPagePreference, string> = {
    automatic: 'Free plans open to Workspace Canvas. Paid plans open to Dashboard.',
    canvas: 'Opens to Workspace Canvas after every sign in.',
    dashboard: 'Opens to Dashboard after every sign in.',
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Lightbulb}>Appearance</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              className={theme === 'light' ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
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
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              className={theme === 'system' ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
              onClick={() => setTheme('system')}
            >
              <Monitor className="mr-2 h-4 w-4" />
              System
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={LogIn}>After sign in</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
            <Label htmlFor="start-page">Open Itemize to</Label>
            <Select value={startPage} onValueChange={handleStartPageChange}>
              <SelectTrigger id="start-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Best page for my plan</SelectItem>
                <SelectItem value="canvas">Workspace Canvas</SelectItem>
                <SelectItem value="dashboard" disabled={!isSubscribed}>
                  Dashboard{!isSubscribed ? ' (paid plans)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {startPageDescription[startPage]}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Accessibility}>Accessibility</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="reduce-motion-toggle">Reduce motion</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Minimize animations and interface transitions on this device.
              </p>
            </div>
            <Switch
              id="reduce-motion-toggle"
              aria-label="Reduce motion"
              checked={reduceMotion}
              onCheckedChange={handleReduceMotionChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Sparkles}>AI Features</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="ai-toggle">Enable AI Enhancements</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Get smart suggestions for list items, note content, and more.
              </p>
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

function PaymentsSettings({ setSaveButton, showCheckoutSuccess, onCloseCheckoutSuccess, onCheckoutConfirmed }: {
  setSaveButton?: (button: React.ReactNode) => void;
  showCheckoutSuccess?: boolean;
  onCloseCheckoutSuccess?: () => void;
  onCheckoutConfirmed?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const [connectingStripe, setConnectingStripe] = useState(false);
  const {
    loading,
    initialLoad,
    saving,
    savingBusiness,
    uploadingLogo,
    settings,
    businesses,
    taxRateInput,
    loadError,
    businessesLoadError,
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    deleteDialogOpen,
    businessToDelete,
    refetchData,
    handleSaveSettings,
    updateField,
    setTaxRateInput,
    openBusinessDialog,
    closeBusinessDialog,
    handleSaveBusiness,
    handleDeleteBusiness,
    handleDeleteClick,
    handleBusinessLogoUpload,
    handleRemoveLogo,
    setBusinessDialogOpen,
    setBusinessFormData,
    setPendingLogoFile,
    setDeleteDialogOpen,
  } = usePaymentsTab();

  // Set save button in header
  useEffect(() => {
    if (setSaveButton) {
      setSaveButton(
        <Button
          onClick={handleSaveSettings}
          disabled={saving || loading || !settings}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      );
    }
    return () => {
      setSaveButton?.(null);
    };
  }, [handleSaveSettings, saving, loading, settings, setSaveButton]);

  useEffect(() => {
    const result = readIntegrationOAuthResult(location.search);
    if (!result) return;
    toast(integrationOAuthToast(result));
    navigate(location.pathname, { replace: true });
    if (result.ok) void refetchData();
  }, [location.pathname, location.search, navigate, refetchData, toast]);

  const handleConnectStripe = async () => {
    if (!organizationId) return;
    setConnectingStripe(true);
    try {
      const { authUrl } = await initiateStripeConnect(organizationId, '/payment-settings');
      window.location.href = authUrl;
    } catch {
      toast({ title: 'Error', description: 'Failed to start Stripe connection', variant: 'destructive' });
      setConnectingStripe(false);
    }
  };

  const handleDisconnectStripe = async () => {
    if (!organizationId) return;
    try {
      await disconnectStripeConnect(organizationId);
      toast({ title: 'Disconnected', description: 'Stripe is no longer connected for invoice payments.' });
      await refetchData();
    } catch {
      toast({ title: 'Error', description: 'Failed to disconnect Stripe', variant: 'destructive' });
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setBusinessFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Show skeleton on initial load or when explicitly loading
  if (initialLoad || loading) {
    return <PaymentsTabLoadingSkeleton />;
  }

  // Show error state only if we have tried loading but have no settings
  if (!settings && !initialLoad) {
    return (
      <PaymentsTabErrorState
        error={loadError ?? 'settings'}
        onRetry={refetchData}
        onUpgrade={() => navigate('/settings')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CheckoutSuccessModal
        open={!!showCheckoutSuccess}
        onClose={() => onCloseCheckoutSuccess?.()}
        onConfirmed={onCheckoutConfirmed}
      />
      {settings && (
        <PaymentSettingsForm
          settings={settings}
          taxRateInput={taxRateInput}
          updateField={updateField}
          setTaxRateInput={setTaxRateInput}
          onConnectStripe={() => void handleConnectStripe()}
          onDisconnectStripe={() => void handleDisconnectStripe()}
          connectingStripe={connectingStripe}
        />
      )}

      <BusinessProfileCard
        businesses={businesses}
        loading={loading}
        loadError={businessesLoadError}
        onRetry={refetchData}
        onAddBusiness={openBusinessDialog}
        onEditBusiness={openBusinessDialog}
        onDeleteBusiness={handleDeleteClick}
      />

      <BusinessFormDialog
        open={businessDialogOpen}
        onOpenChange={setBusinessDialogOpen}
        editingBusiness={editingBusiness}
        formData={businessFormData}
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
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshSubscription } = useSubscriptionFeatures();
  const [saveButton, setSaveButton] = useState<React.ReactNode>(null);
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);

  const activeNavItem = settingsNav.find(item => item.path === location.pathname) || settingsNav[0];
  const ActivePageIcon = activeNavItem.icon;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutStatus = params.get('checkout');

    if (checkoutStatus === 'success') {
      setShowCheckoutSuccess(true);
      refreshSubscription();
      navigate(location.pathname, { replace: true });
    } else if (checkoutStatus === 'canceled') {
      toast({ title: 'Checkout canceled', description: 'You can upgrade anytime from the Payments page.' });
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, toast, refreshSubscription]);

  return (
    <PageLayout
      title={activeNavItem.title.toUpperCase()}
      icon={<ActivePageIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      headerActions={saveButton}
      mobileActions={saveButton ? <div className="flex-1">{saveButton}</div> : undefined}
      nav={<SettingsNav />}
      navigationBreakpoint="wide"
    >
      <div key={location.pathname}>
        {location.pathname === '/preferences' && <PreferencesSettings />}
        {location.pathname === '/organization-settings' && <OrganizationSettings />}
        {location.pathname === '/settings/integrations' && <IntegrationsSettings embedded />}
        {location.pathname === '/payment-settings' && (
          <PaymentsSettings
            setSaveButton={setSaveButton}
            showCheckoutSuccess={showCheckoutSuccess}
            onCloseCheckoutSuccess={() => setShowCheckoutSuccess(false)}
            onCheckoutConfirmed={refreshSubscription}
          />
        )}
        {location.pathname === '/settings' && <AccountSettings />}
      </div>
    </PageLayout>
  );
}

export default SettingsPage;
