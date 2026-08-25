import { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Code2,
  Copy,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Palette,
  Save,
  Settings,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  IconTabsList,
  IconTabsTrigger,
  Tabs,
  TabsContent,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageLayout } from '@/components/layout/PageLayout';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { SettingsFieldLabel } from '@/components/settings/SettingsPrimitives';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useToast } from '@/hooks/use-toast';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  createChatWidget,
  getChatWidget,
  getEmbedCode,
  updateChatWidget,
  type ChatWidgetConfig,
} from '@/services/chatWidgetApi';
import {
  ChatWidgetPreview,
  type ChatWidgetPreviewConfig,
} from './ChatWidgetPreview';

interface LocalChatWidgetConfig extends ChatWidgetPreviewConfig {
  id?: number;
  auto_open_delay: number;
  notification_sound: boolean;
}

const DEFAULT_CONFIG: LocalChatWidgetConfig = {
  is_active: false,
  name: 'Chat',
  welcome_title: 'Hi there!',
  welcome_message: 'How can we help you today?',
  offline_message: 'We are currently offline. Leave a message and we will get back to you.',
  placeholder_text: 'Type your message...',
  primary_color: '#2563EB',
  text_color: '#FFFFFF',
  position: 'bottom-right',
  show_branding: true,
  require_email: false,
  require_name: false,
  require_phone: false,
  auto_open_delay: 0,
  notification_sound: true,
};

const toLocalConfig = (widget: ChatWidgetConfig): LocalChatWidgetConfig => ({
  id: widget.id,
  is_active: widget.is_active,
  name: widget.name,
  welcome_title: widget.welcome_title,
  welcome_message: widget.welcome_message,
  offline_message: widget.offline_message,
  placeholder_text: widget.placeholder_text,
  primary_color: widget.primary_color,
  text_color: widget.text_color,
  position: widget.position,
  show_branding: widget.show_branding,
  require_email: widget.require_email,
  require_name: widget.require_name,
  require_phone: widget.require_phone,
  auto_open_delay: widget.auto_open_delay,
  notification_sound: widget.notification_sound,
});

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function ChatWidgetPage() {
  const { toast } = useToast();
  const {
    showModal: showOnboarding,
    handleComplete: completeOnboarding,
    handleDismiss: dismissOnboarding,
    handleClose: closeOnboarding,
    featureKey: onboardingFeatureKey,
  } = useRouteOnboarding();
  const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [config, setConfig] = useState<LocalChatWidgetConfig | null>(null);
  const [embedCode, setEmbedCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const { isDirty, markClean } = useDirtyState({
    value: config,
    ready: Boolean(config) && !loading,
    resetKey: organizationId || 'chat-widget',
  });
  useUnsavedChangesGuard({
    when: isDirty,
    message: 'This chat widget has unsaved changes. Leave without saving them?',
  });

  useEffect(() => {
    if (!organizationId && initError) setLoading(false);
  }, [organizationId, initError]);

  const fetchConfig = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const configResponse = await getChatWidget(organizationId);
      setConfig(configResponse ? toLocalConfig(configResponse) : DEFAULT_CONFIG);

      if (configResponse) {
        try {
          const embedResponse = await getEmbedCode(organizationId);
          setEmbedCode(embedResponse?.embed_code || '');
        } catch {
          setEmbedCode('');
        }
      } else {
        setEmbedCode('');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load chat widget', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const updateConfig = <K extends keyof LocalChatWidgetConfig>(
    field: K,
    value: LocalChatWidgetConfig[K],
  ) => {
    setConfig((previous) => previous ? { ...previous, [field]: value } : previous);
  };

  const handleSave = async () => {
    if (!organizationId || !config) return;
    if (!isHexColor(config.primary_color) || !isHexColor(config.text_color)) {
      toast({
        title: 'Check widget colors',
        description: 'Use six-digit hex values such as #2563EB.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const savedConfig = config.id
        ? await updateChatWidget(config, organizationId)
        : await createChatWidget(config, organizationId);
      const nextConfig = toLocalConfig(savedConfig);
      setConfig(nextConfig);
      markClean(nextConfig);
      toast({ title: 'Chat widget saved' });

      try {
        const embedResponse = await getEmbedCode(organizationId);
        setEmbedCode(embedResponse?.embed_code || '');
      } catch {
        setEmbedCode('');
      }
    } catch (error) {
      toast({
        title: 'Could not save chat widget',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyEmbedCode = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      toast({ title: 'Embed code copied' });
    } catch {
      toast({ title: 'Could not copy embed code', variant: 'destructive' });
    }
  };

  if (initError) {
    return (
      <PageLayout
        title="CHAT WIDGET"
        icon={<MessageCircle className="h-5 w-5 flex-shrink-0 text-blue-600" />}
      >
        <ErrorState
          title="Unable to load chat widget"
          description={initError}
          onAction={() => void fetchConfig()}
        />
      </PageLayout>
    );
  }

  if (loading || !config) {
    return (
      <PageLayout
        title="CHAT WIDGET"
        icon={<MessageCircle className="h-5 w-5 flex-shrink-0 text-blue-600" />}
        className="mx-auto max-w-7xl"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <Skeleton className="h-[34rem]" />
          <Skeleton className="h-[38rem]" />
        </div>
      </PageLayout>
    );
  }

  const saveButton = (
    <Button
      size="sm"
      onClick={() => void handleSave()}
      disabled={saving || (Boolean(config.id) && !isDirty)}
    >
      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      {saving ? 'Saving...' : 'Save Changes'}
    </Button>
  );

  return (
    <PageLayout
      title="CHAT WIDGET"
      icon={<MessageCircle className="h-5 w-5 flex-shrink-0 text-blue-600" />}
      className="mx-auto max-w-7xl"
      mobileClassName="flex-col items-stretch gap-3"
      headerActions={
        <>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <IconTabsList className="h-9">
              <IconTabsTrigger value="settings" className="text-xs">
                <Settings className="mr-1 h-4 w-4" />Settings
              </IconTabsTrigger>
              <IconTabsTrigger value="appearance" className="text-xs">
                <Palette className="mr-1 h-4 w-4" />Appearance
              </IconTabsTrigger>
              <IconTabsTrigger value="install" className="text-xs">
                <Code2 className="mr-1 h-4 w-4" />Install
              </IconTabsTrigger>
            </IconTabsList>
          </Tabs>
          {saveButton}
        </>
      }
      mobileActions={
        <>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <IconTabsList className="grid w-full grid-cols-3">
              <IconTabsTrigger value="settings">
                <Settings className="mr-1 h-4 w-4" />Settings
              </IconTabsTrigger>
              <IconTabsTrigger value="appearance">
                <Palette className="mr-1 h-4 w-4" />Style
              </IconTabsTrigger>
              <IconTabsTrigger value="install">
                <Code2 className="mr-1 h-4 w-4" />Install
              </IconTabsTrigger>
            </IconTabsList>
          </Tabs>
          <div className="[&>button]:w-full">{saveButton}</div>
        </>
      }
    >
      {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] ? (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={closeOnboarding}
          onComplete={completeOnboarding}
          onDismiss={dismissOnboarding}
          content={ONBOARDING_CONTENT[onboardingFeatureKey]}
        />
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="min-w-0">
            <TabsContent value="settings" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <SectionCardTitle icon={SlidersHorizontal}>Availability &amp; Behavior</SectionCardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="chat-widget-active">Enable chat widget</Label>
                      <p className="mt-1 text-sm text-muted-foreground">Show the launcher on installed websites.</p>
                    </div>
                    <Switch
                      id="chat-widget-active"
                      checked={config.is_active}
                      onCheckedChange={(checked) => updateConfig('is_active', checked)}
                    />
                  </div>

                  <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <SettingsFieldLabel
                        htmlFor="chat-widget-auto-open"
                        help="Set this to 0 to keep the widget closed until a visitor opens it."
                        helpLabel="About auto-open delay"
                      >
                        Auto-open delay
                      </SettingsFieldLabel>
                      <div className="relative">
                        <Input
                          id="chat-widget-auto-open"
                          type="number"
                          min={0}
                          max={86400}
                          value={config.auto_open_delay}
                          onChange={(event) => updateConfig('auto_open_delay', Math.max(0, Number(event.target.value) || 0))}
                          className="pr-20"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">seconds</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        <Label htmlFor="chat-widget-sound">Notification sound</Label>
                      </div>
                      <Switch
                        id="chat-widget-sound"
                        checked={config.notification_sound}
                        onCheckedChange={(checked) => updateConfig('notification_sound', checked)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionCardTitle icon={MessageSquareText}>Messages</SectionCardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="chat-widget-name">Widget name</Label>
                      <Input id="chat-widget-name" value={config.name} maxLength={255} onChange={(event) => updateConfig('name', event.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chat-widget-welcome-title">Welcome title</Label>
                      <Input id="chat-widget-welcome-title" value={config.welcome_title} maxLength={255} onChange={(event) => updateConfig('welcome_title', event.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chat-widget-welcome-message">Welcome message</Label>
                    <Textarea id="chat-widget-welcome-message" value={config.welcome_message} onChange={(event) => updateConfig('welcome_message', event.target.value)} rows={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chat-widget-offline-message">Offline message</Label>
                    <Textarea id="chat-widget-offline-message" value={config.offline_message} onChange={(event) => updateConfig('offline_message', event.target.value)} rows={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chat-widget-placeholder">Message placeholder</Label>
                    <Input id="chat-widget-placeholder" value={config.placeholder_text} maxLength={255} onChange={(event) => updateConfig('placeholder_text', event.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionCardTitle icon={UserRound}>Visitor Details</SectionCardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y rounded-lg border">
                    {([
                      ['require_name', 'Require name'],
                      ['require_email', 'Require email'],
                      ['require_phone', 'Require phone'],
                    ] as const).map(([field, label]) => (
                      <div key={field} className="flex items-center justify-between gap-4 p-3">
                        <Label htmlFor={`chat-widget-${field}`}>{label}</Label>
                        <Switch id={`chat-widget-${field}`} checked={config[field]} onCheckedChange={(checked) => updateConfig(field, checked)} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">Selected details are collected before a visitor starts chatting.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0">
              <Card>
                <CardHeader>
                  <SectionCardTitle icon={Palette}>Appearance</SectionCardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="chat-widget-primary-color">Primary color</Label>
                      <div className="flex items-center gap-3">
                        <input id="chat-widget-primary-color" type="color" value={isHexColor(config.primary_color) ? config.primary_color : '#2563EB'} onChange={(event) => updateConfig('primary_color', event.target.value.toUpperCase())} className="h-10 w-10 cursor-pointer rounded-md border bg-background p-1" />
                        <Input aria-label="Primary color hex value" value={config.primary_color} maxLength={7} onChange={(event) => updateConfig('primary_color', event.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chat-widget-text-color">Button text color</Label>
                      <div className="flex items-center gap-3">
                        <input id="chat-widget-text-color" type="color" value={isHexColor(config.text_color) ? config.text_color : '#FFFFFF'} onChange={(event) => updateConfig('text_color', event.target.value.toUpperCase())} className="h-10 w-10 cursor-pointer rounded-md border bg-background p-1" />
                        <Input aria-label="Button text color hex value" value={config.text_color} maxLength={7} onChange={(event) => updateConfig('text_color', event.target.value.toUpperCase())} />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="chat-widget-position">Launcher position</Label>
                    <Select value={config.position} onValueChange={(value) => updateConfig('position', value as LocalChatWidgetConfig['position'])}>
                      <SelectTrigger id="chat-widget-position"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Bottom right</SelectItem>
                        <SelectItem value="bottom-left">Bottom left</SelectItem>
                        <SelectItem value="top-right">Top right</SelectItem>
                        <SelectItem value="top-left">Top left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-5">
                    <div>
                      <Label htmlFor="chat-widget-branding">Show Itemize branding</Label>
                      <p className="mt-1 text-sm text-muted-foreground">Display a compact powered-by line in the widget.</p>
                    </div>
                    <Switch id="chat-widget-branding" checked={config.show_branding} onCheckedChange={(checked) => updateConfig('show_branding', checked)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="install" className="mt-0">
              <Card>
                <CardHeader>
                  <SectionCardTitle icon={Code2}>Install Widget</SectionCardTitle>
                </CardHeader>
                <CardContent>
                  {embedCode ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">Paste this code immediately before the closing body tag on your website.</p>
                      <div className="relative">
                        <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 pr-24 text-sm"><code>{embedCode}</code></pre>
                        <Button type="button" variant="outline" size="sm" className="absolute right-2 top-2" onClick={() => void copyEmbedCode()}>
                          <Copy className="mr-2 h-4 w-4" />Copy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={Code2} title="Save to generate install code" description="Your embed code will be available after the widget is created." actionLabel="Save widget" onAction={() => void handleSave()} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <aside className="min-w-0 xl:sticky xl:top-6">
            <ChatWidgetPreview config={config} />
          </aside>
        </div>
      </Tabs>
    </PageLayout>
  );
}

export default ChatWidgetPage;
