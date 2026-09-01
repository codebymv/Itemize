import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthState } from '@/contexts/AuthContext';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { getAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AVAILABLE_PLANS_HASH,
  AVAILABLE_PLANS_PATH,
  isAvailablePlansLocation,
} from '@/lib/settingsNavigation';
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
  ChevronDown,
  Save,
} from 'lucide-react';
import {
  SettingsInfoTooltip,
  SettingsSectionTitle,
} from '@/components/settings/SettingsPrimitives';
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
import { ManageAccountCard } from './settings/components/ManageAccountCard';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
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

export function SettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label="Settings sections" className="hidden flex-col gap-1 lg:flex">
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
                "mr-2 h-4 w-4 transition-colors group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400",
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
              )}
            />
            {item.title}
          </Button>
        );
      })}
    </nav>
  );
}

export function SettingsShellNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname === '/settings/' ? '/settings' : location.pathname;
  const activeItem = settingsNav.find((item) => item.path === activePath) ?? settingsNav[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="min-w-0">
      <h1 className="sr-only">{activeItem.title.toUpperCase()}</h1>
      <Select value={activeItem.path} onValueChange={(value) => navigate(value)}>
        <SelectTrigger
          aria-label="Settings section"
          className="h-11 w-auto max-w-full gap-2 bg-background px-3 font-raleway [&>span]:!flex [&>span]:line-clamp-none"
        >
          <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <ActiveIcon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400"
              data-settings-section-icon={activeItem.title}
            />
            <span className="text-lg font-semibold italic text-foreground">
              {activeItem.title.toUpperCase()}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent align="start">
          {settingsNav.map((item) => (
            <SelectItem key={item.path} value={item.path} className="py-2.5 pr-3">
              <span className="flex items-center gap-2">
                <item.icon
                  aria-hidden="true"
                  className={cn(
                    'h-4 w-4 shrink-0',
                    item.path === activeItem.path
                      ? 'text-blue-600'
                      : 'text-muted-foreground',
                  )}
                />
                <span>{item.title}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
  const location = useLocation();
  const { startCheckout, startSoloTrial } = useSubscriptionFeatures();
  const { toast } = useToast();
  const plansRequested = isAvailablePlansLocation(location.search, location.hash);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const { pending: isLoading, run: runUpgrade } = useSingleFlightAction();
  const [plansOpen, setPlansOpen] = useState(plansRequested);
  const plansContentRef = useRef<HTMLDivElement>(null);
  const { data: usageStats } = useUsageStats();
  const joinedAt = currentUser?.createdAt ? new Date(currentUser.createdAt) : null;
  const hasValidJoinedAt = joinedAt && !Number.isNaN(joinedAt.getTime());
  const joinedDate = hasValidJoinedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(joinedAt)
    : null;
  const joinedDateTime = hasValidJoinedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(joinedAt)
    : undefined;

  useEffect(() => {
    if (!plansRequested) return;

    setPlansOpen(true);
    const scrollTimer = window.setTimeout(() => {
      const reduceMotion = getReduceMotionPreference()
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      plansContentRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 300);

    return () => window.clearTimeout(scrollTimer);
  }, [currentPlan, plansRequested, usageStats]);

  const handleUpgrade = async (planId: Plan) => {
    if (planId === 'free') return;
    if (currentPlan === planId && !canSubscribeCurrentTrial) return;

    await runUpgrade(async () => {
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
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Trial Status Card - Shows only during active trial */}
      <TrialStatusCard />

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={User}>Account Information</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-medium flex-shrink-0">
              {currentUser?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-center sm:text-left min-w-0 flex-1">
              <p className="font-medium break-words">{currentUser?.name || 'User'}</p>
              <div className="mt-1 flex flex-col gap-x-6 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-1">
                <p className="min-w-0 break-all sm:break-words">{currentUser?.email}</p>
                {joinedDate && currentUser?.createdAt && (
                  <p className="whitespace-nowrap sm:ml-auto">
                    Joined:{' '}
                    <time dateTime={currentUser.createdAt} title={joinedDateTime}>
                      {joinedDate}
                    </time>
                  </p>
                )}
              </div>
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
            <SettingsSectionTitle icon={Gauge}>
              <span className="flex items-center gap-1.5">
                Current Usage
                {(usageStats.usage.emails.limit === 0 || usageStats.usage.sms.limit === 0 || usageStats.usage.apiCalls.limit === 0) && (
                  <SettingsInfoTooltip label="Plan availability for usage features">
                    <div className="space-y-1">
                      {(usageStats.usage.emails.limit === 0 || usageStats.usage.sms.limit === 0) && (
                        <p>
                          {usageStats.usage.emails.limit === 0 && usageStats.usage.sms.limit === 0
                            ? 'Email and SMS are available on Solo and Studio.'
                            : `${usageStats.usage.emails.limit === 0 ? 'Email' : 'SMS'} is available on Solo and Studio.`}
                        </p>
                      )}
                      {usageStats.usage.apiCalls.limit === 0 && (
                        <p>API calls are available on Studio.</p>
                      )}
                    </div>
                  </SettingsInfoTooltip>
                )}
              </span>
            </SettingsSectionTitle>
          </CardHeader>
          <CardContent surface="inset">
            <UsageIndicatorGrid>
              <UsageIndicator
                resourceType="emails"
                used={usageStats.usage.emails.used}
                limit={typeof usageStats.usage.emails.limit === 'number' ? usageStats.usage.emails.limit : -1}
                label="Emails"
                icon={<Mail className="h-5 w-5" />}
                showAvailabilityHint={false}
              />
              <UsageIndicator
                resourceType="sms"
                used={usageStats.usage.sms.used}
                limit={typeof usageStats.usage.sms.limit === 'number' ? usageStats.usage.sms.limit : -1}
                label="SMS"
                icon={<MessageSquare className="h-5 w-5" />}
                showAvailabilityHint={false}
              />
              <UsageIndicator
                resourceType="apiCalls"
                used={usageStats.usage.apiCalls.used}
                limit={typeof usageStats.usage.apiCalls.limit === 'number' ? usageStats.usage.apiCalls.limit : -1}
                label="API Calls"
                icon={<Code2 className="h-5 w-5" />}
                showAvailabilityHint={false}
              />
            </UsageIndicatorGrid>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Layers3}>Available Plans</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset">
          <Collapsible open={plansOpen} onOpenChange={setPlansOpen}>
            <div className="flex flex-col gap-4 min-[1300px]:flex-row min-[1300px]:items-center min-[1300px]:justify-between">
              <p className="text-sm text-muted-foreground">
                Compare Solo and Studio features, limits, and pricing.
              </p>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-fit">
                  Compare plans
                  <ChevronDown
                    className={cn(
                      'ml-2 h-4 w-4 text-blue-600 transition-transform',
                      plansOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div
                id={AVAILABLE_PLANS_HASH.slice(1)}
                ref={plansContentRef}
                className="mt-5 scroll-mt-24"
              >
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
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <ManageAccountCard />
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
        <CardContent surface="inset">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              className={theme === 'light' ? 'bg-blue-600 text-white interaction-button--primary' : ''}
              onClick={() => setTheme('light')}
            >
              <Sun className="mr-2 h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              className={`flex-1 ${theme === 'dark' ? 'bg-blue-600 interaction-button--primary text-white' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              className={theme === 'system' ? 'bg-blue-600 text-white interaction-button--primary' : ''}
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
        <CardContent surface="inset">
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
        <CardContent surface="inset">
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
        <CardContent surface="inset">
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
  const { isLoading: subscriptionLoading, isSubscribed } = useSubscriptionState();
  const { organizationId } = useOrganization();
  const { pending: connectingStripe, run: runStripeAction } = useSingleFlightAction();
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
    hasMoreBusinesses,
    loadingMoreBusinesses,
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    deleteDialogOpen,
    businessToDelete,
    refetchData,
    loadMoreBusinesses,
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
  } = usePaymentsTab({ enabled: !subscriptionLoading && isSubscribed });

  // Set save button in header
  useEffect(() => {
    if (!setSaveButton) return;

    if (initialLoad || loading || !settings || loadError) {
      setSaveButton(null);
      return () => setSaveButton(null);
    }

    const label = saving ? 'Saving…' : 'Save changes';
    setSaveButton(
      <HeaderAction
        label={label}
        onClick={handleSaveSettings}
        disabled={saving}
        busy={saving}
        icon={saving
          ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          : <Save aria-hidden="true" className="h-4 w-4" />}
      />
    );

    return () => {
      setSaveButton(null);
    };
  }, [handleSaveSettings, initialLoad, loadError, loading, saving, settings, setSaveButton]);

  useEffect(() => {
    const result = readIntegrationOAuthResult(location.search);
    if (!result) return;
    toast(integrationOAuthToast(result));
    navigate(location.pathname, { replace: true });
    if (result.ok) void refetchData();
  }, [location.pathname, location.search, navigate, refetchData, toast]);

  const handleConnectStripe = async () => {
    if (!organizationId) return;
    await runStripeAction(async () => {
      try {
        const { authUrl } = await initiateStripeConnect(organizationId, '/payment-settings');
        window.location.href = authUrl;
      } catch {
        toast({ title: 'Error', description: 'Failed to start Stripe connection', variant: 'destructive' });
      }
    });
  };

  const handleDisconnectStripe = async () => {
    if (!organizationId) return;
    await runStripeAction(async () => {
      try {
        await disconnectStripeConnect(organizationId);
        toast({ title: 'Disconnected', description: 'Stripe is no longer connected for invoice payments.' });
        await refetchData();
      } catch {
        toast({ title: 'Error', description: 'Failed to disconnect Stripe', variant: 'destructive' });
      }
    });
  };

  const handleFormChange = (field: string, value: string) => {
    setBusinessFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Resolve the plan gate before mounting protected payment data. This keeps
  // Free accounts on the same stable entitlement-first path as Integrations.
  if (!subscriptionLoading && !isSubscribed) {
    return (
      <PaymentsTabErrorState
        error="subscription"
        onRetry={refetchData}
        onUpgrade={() => navigate(AVAILABLE_PLANS_PATH)}
      />
    );
  }

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
        onUpgrade={() => navigate(AVAILABLE_PLANS_PATH)}
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
        hasMore={hasMoreBusinesses}
        loadingMore={loadingMoreBusinesses}
        onLoadMore={() => void loadMoreBusinesses()}
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
      icon={<ActivePageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
      headerTools={saveButton ? { primaryAction: saveButton } : undefined}
      compactNavigation={<SettingsShellNavigation />}
      nav={<SettingsNav />}
      navigationBreakpoint="wide"
    >
      <div key={location.pathname}>
        {location.pathname === '/preferences' && <PreferencesSettings />}
        {location.pathname === '/organization-settings' && (
          <OrganizationSettings setSaveButton={setSaveButton} />
        )}
        {location.pathname === '/settings/integrations' && <IntegrationsSettings embedded />}
        {location.pathname === '/payment-settings' && (
          <PaymentsSettings
            setSaveButton={setSaveButton}
            showCheckoutSuccess={showCheckoutSuccess}
            onCloseCheckoutSuccess={() => setShowCheckoutSuccess(false)}
            onCheckoutConfirmed={async () => { await refreshSubscription(); }}
          />
        )}
        {location.pathname === '/settings' && <AccountSettings />}
      </div>
    </PageLayout>
  );
}

export default SettingsPage;
