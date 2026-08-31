import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Link2, Loader2, MoreHorizontal, Pencil, Plus, Save, Settings2, Trash2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { Dialog } from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { HeaderAction, HeaderModeNavigation } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { AvailabilitySettingRow, SettingsFieldLabel } from '@/components/settings/SettingsPrimitives';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import {
  addPlatform,
  removePlatform,
  updateReputationSettings,
  type ReputationSettings,
  type ReviewPlatform,
} from '@/services/reputationApi';
import {
  getReputationConfigurationBootstrapViaGraphql,
  type ReputationConfigurationBootstrap,
} from '@/services/reputationConfigurationGraphql';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { ReputationPlatformMark } from './components/ReputationPlatformMark';
import { getReputationPlatformLabel, getReviewPlatformConnectionVisual, REPUTATION_PLATFORM_LABELS, type ReputationPlatformKey } from './constants/reputationVisuals';

type SettingsMode = 'platforms' | 'automation' | 'alerts';
type PlatformDraft = Pick<ReviewPlatform, 'platform'> & Partial<Pick<ReviewPlatform, 'platform_name' | 'place_id' | 'page_id' | 'business_url' | 'review_url'>>;

const MODES = [
  { value: 'platforms', label: 'Platforms', icon: Link2 },
  { value: 'automation', label: 'Automation', icon: Zap },
  { value: 'alerts', label: 'Alerts', icon: BellRing },
] as const;
const PLATFORM_KEYS = Object.keys(REPUTATION_PLATFORM_LABELS) as ReputationPlatformKey[];
const EMPTY_PLATFORM: PlatformDraft = { platform: 'google' };

export function ReputationSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, isLoading: organizationLoading, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [mode, setMode] = useState<SettingsMode>('platforms');
  const [settings, setSettings] = useState<ReputationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [platformDraft, setPlatformDraft] = useState<PlatformDraft>(EMPTY_PLATFORM);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [platformToDelete, setPlatformToDelete] = useState<ReviewPlatform | null>(null);
  const bootstrapQueryKey = ['reputation-configuration', organizationId] as const;
  const bootstrapQuery = useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: ({ signal }) => getReputationConfigurationBootstrapViaGraphql(
      organizationId as number,
      signal,
    ),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const platforms = bootstrapQuery.data?.platforms ?? [];
  const settingsReady = Boolean(settings && settings.organization_id === organizationId);
  const loading = organizationLoading || bootstrapQuery.isPending || !settingsReady;
  const loadError = Boolean(bootstrapQuery.error && !bootstrapQuery.data);
  const { isDirty, markClean } = useDirtyState({
    value: settings,
    ready: !loading && settingsReady,
    resetKey: organizationId ?? 'settings',
  });

  useEffect(() => {
    if (!bootstrapQuery.data) return;
    setSettings(current => current?.organization_id === organizationId
      ? current
      : bootstrapQuery.data.settings);
  }, [bootstrapQuery.data, organizationId]);

  const updateSetting = <K extends keyof ReputationSettings>(field: K, value: ReputationSettings[K]) => {
    setSettings(current => current ? { ...current, [field]: value } : current);
  };

  const saveSettings = async () => {
    if (!organizationId || !settings || saving) return;
    setSaving(true);
    try {
      const saved = await updateReputationSettings(settings, organizationId);
      setSettings(saved);
      queryClient.setQueryData<ReputationConfigurationBootstrap>(
        bootstrapQueryKey,
        current => current ? { ...current, settings: saved } : current,
      );
      markClean(saved);
      toast({ title: 'Reputation settings saved' });
    } catch {
      toast({ title: 'Could not save reputation settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openPlatform = (platform?: ReviewPlatform) => {
    setPlatformDraft(platform ? {
      platform: platform.platform,
      platform_name: platform.platform_name,
      place_id: platform.place_id,
      page_id: platform.page_id,
      business_url: platform.business_url,
      review_url: platform.review_url,
    } : EMPTY_PLATFORM);
    setPlatformDialogOpen(true);
  };

  const savePlatform = async () => {
    if (!organizationId || savingPlatform) return;
    setSavingPlatform(true);
    try {
      const saved = await addPlatform(platformDraft, organizationId);
      queryClient.setQueryData<ReputationConfigurationBootstrap>(bootstrapQueryKey, current => current ? {
        ...current,
        platforms: [...current.platforms.filter(item => item.id !== saved.id && !(item.platform === saved.platform && item.place_id === saved.place_id)), saved]
          .sort((left, right) => getReputationPlatformLabel(left.platform).localeCompare(getReputationPlatformLabel(right.platform))),
      } : current);
      setPlatformDialogOpen(false);
      toast({ title: 'Review platform saved' });
    } catch {
      toast({ title: 'Could not save review platform', variant: 'destructive' });
    } finally {
      setSavingPlatform(false);
    }
  };

  const deletePlatform = async (): Promise<boolean> => {
    if (!organizationId || !platformToDelete) return false;
    try {
      await removePlatform(platformToDelete.id, organizationId);
      queryClient.setQueryData<ReputationConfigurationBootstrap>(bootstrapQueryKey, current => current ? {
        ...current,
        platforms: current.platforms.filter(item => item.id !== platformToDelete.id),
      } : current);
      setPlatformToDelete(null);
      return true;
    } catch {
      return false;
    }
  };

  if (initError || loadError) {
    return (
      <PageLayout title="CONFIGURATION" icon={<Settings2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
        {initError ? (
          <OrganizationErrorState title="Unable to load reputation settings" icon={Settings2} />
        ) : (
          <ErrorState kind="page" title="Unable to load reputation settings" description="Could not load reputation settings." onAction={() => void bootstrapQuery.refetch()} />
        )}
      </PageLayout>
    );
  }

  if (loading || !settings) {
    return <PageLayout title="CONFIGURATION" icon={<Settings2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}><Skeleton className="h-[34rem]" /></PageLayout>;
  }

  return (
    <PageLayout
      title="CONFIGURATION"
      icon={<Settings2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      className={mode === 'platforms' && platforms.length === 0 ? undefined : 'max-w-5xl'}
      headerTools={{
        modeNavigation: <HeaderModeNavigation label="Reputation settings mode" value={mode} onValueChange={value => setMode(value as SettingsMode)} items={[...MODES]} />,
        primaryAction: mode === 'platforms'
          ? <HeaderAction label="Add platform" icon={<Plus className="h-4 w-4" />} onClick={() => openPlatform()} />
          : <HeaderAction label={saving ? 'Saving...' : 'Save changes'} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} disabled={saving || !isDirty} busy={saving} onClick={() => void saveSettings()} />,
      }}
    >
      <Tabs value={mode} onValueChange={value => setMode(value as SettingsMode)}>
        <TabsContent value="platforms" className="mt-0">
          <Card>
            {platforms.length > 0 ? <CardHeader><SectionCardTitle icon={Link2}>Review platforms</SectionCardTitle></CardHeader> : null}
            <CardContent className="p-0">
              {platforms.length === 0 ? <EmptyState icon={Link2} title="No review platforms yet" description="Connect a platform when you are ready to collect reviews." actionLabel="Add platform" onAction={() => openPlatform()} className="p-12" /> : (
                <div className="divide-y">
                  {platforms.map(platform => {
                    const connectionVisual = getReviewPlatformConnectionVisual(platform.is_connected);
                    return (
                    <div key={platform.id} className="flex items-center gap-3 px-4 py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60"><ReputationPlatformMark platform={platform.platform} className="h-6 w-6" /></div>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium">{platform.platform_name || getReputationPlatformLabel(platform.platform)}</h3><Badge className={connectionVisual.badgeClass}>{connectionVisual.label}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{platform.review_url || platform.business_url || 'Connected review source'}</p></div>
                      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`More actions for ${getReputationPlatformLabel(platform.platform)}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openPlatform(platform)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setPlatformToDelete(platform)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Disconnect</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="mt-0 space-y-6">
          <Card>
            <CardHeader><SectionCardTitle icon={Zap}>Automatic requests</SectionCardTitle></CardHeader>
            <CardContent surface="inset" className="space-y-5">
              <AvailabilitySettingRow id="auto-review-requests" label="Send review requests automatically" checked={settings.auto_request_enabled} onCheckedChange={value => updateSetting('auto_request_enabled', value)} help="Requests are created after the selected customer event and delay." helpLabel="About automatic review requests" />
              <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
                <div className="grid gap-2"><Label htmlFor="request-trigger">Trigger</Label><Select value={settings.auto_request_trigger} onValueChange={value => updateSetting('auto_request_trigger', value)}><SelectTrigger id="request-trigger"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice_paid">Invoice paid</SelectItem><SelectItem value="booking_completed">Booking completed</SelectItem><SelectItem value="deal_won">Deal won</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label htmlFor="request-channel">Channel</Label><Select value={settings.auto_request_channel} onValueChange={value => updateSetting('auto_request_channel', value)}><SelectTrigger id="request-channel"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="both">Email and SMS</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label htmlFor="request-delay">Delay (days)</Label><Input id="request-delay" type="number" min={0} max={365} value={settings.auto_request_delay_days} onChange={event => updateSetting('auto_request_delay_days', Math.max(0, Math.min(365, Number(event.target.value) || 0)))} /></div>
              </div>
              <div className="grid gap-2 border-t pt-5"><SettingsFieldLabel htmlFor="default-review-url" help="Used when a request does not specify a preferred platform." helpLabel="About the default review URL">Default review URL</SettingsFieldLabel><Input id="default-review-url" type="url" placeholder="https://..." value={settings.default_review_url ?? ''} onChange={event => updateSetting('default_review_url', event.target.value || null)} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-0">
          <Card>
            <CardHeader><SectionCardTitle icon={BellRing}>Feedback routing</SectionCardTitle></CardHeader>
            <CardContent surface="inset" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="negative-threshold">Negative rating threshold</Label><Select value={String(settings.negative_threshold)} onValueChange={value => updateSetting('negative_threshold', Number(value))}><SelectTrigger id="negative-threshold"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map(rating => <SelectItem key={rating} value={String(rating)}>{rating} stars or lower</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-2"><Label htmlFor="negative-alert-email">Alert email</Label><Input id="negative-alert-email" type="email" value={settings.negative_alert_email ?? ''} onChange={event => updateSetting('negative_alert_email', event.target.value || null)} /></div>
              </div>
              <div className="grid divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="flex items-center justify-between gap-3 p-3"><Label htmlFor="route-negative-internal">Keep negative feedback internal</Label><Switch id="route-negative-internal" checked={settings.negative_route_internal} onCheckedChange={value => updateSetting('negative_route_internal', value)} /></div>
                <div className="flex items-center justify-between gap-3 p-3"><Label htmlFor="notify-review-email">Email me about new reviews</Label><Switch id="notify-review-email" checked={settings.new_review_notify_email} onCheckedChange={value => updateSetting('new_review_notify_email', value)} /></div>
              </div>
              <div className="grid gap-2 border-t pt-5"><SettingsFieldLabel htmlFor="positive-route-url" help="Positive reviewers can continue to this public review destination." helpLabel="About positive feedback routing">Positive review URL</SettingsFieldLabel><Input id="positive-route-url" type="url" placeholder="https://..." value={settings.positive_route_url ?? ''} onChange={event => updateSetting('positive_route_url', event.target.value || null)} /></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={platformDialogOpen} onOpenChange={setPlatformDialogOpen}>
        <ModalContent size="md">
          <ModalHeader
            icon={Link2}
            title="Review platform"
            description="Connect a destination where customers can leave a public review."
          />
          <ModalBody className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="platform-type">Platform</Label><Select value={platformDraft.platform} onValueChange={value => setPlatformDraft({ ...EMPTY_PLATFORM, platform: value as ReviewPlatform['platform'] })}><SelectTrigger id="platform-type"><SelectValue /></SelectTrigger><SelectContent>{PLATFORM_KEYS.map(platform => <SelectItem key={platform} value={platform}>{REPUTATION_PLATFORM_LABELS[platform]}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="platform-name">Display name</Label><Input id="platform-name" value={platformDraft.platform_name ?? ''} onChange={event => setPlatformDraft(current => ({ ...current, platform_name: event.target.value || null }))} /></div>
            {platformDraft.platform === 'google' ? <div className="grid gap-2 sm:col-span-2"><Label htmlFor="platform-place-id">Google Place ID</Label><Input id="platform-place-id" value={platformDraft.place_id ?? ''} onChange={event => setPlatformDraft(current => ({ ...current, place_id: event.target.value || null }))} /></div> : null}
            {platformDraft.platform === 'facebook' ? <div className="grid gap-2 sm:col-span-2"><Label htmlFor="platform-page-id">Facebook Page ID</Label><Input id="platform-page-id" value={platformDraft.page_id ?? ''} onChange={event => setPlatformDraft(current => ({ ...current, page_id: event.target.value || null }))} /></div> : null}
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="platform-review-url">Review URL</Label><Input id="platform-review-url" type="url" placeholder="https://..." value={platformDraft.review_url ?? ''} onChange={event => setPlatformDraft(current => ({ ...current, review_url: event.target.value || null }))} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="platform-business-url">Business URL</Label><Input id="platform-business-url" type="url" placeholder="https://..." value={platformDraft.business_url ?? ''} onChange={event => setPlatformDraft(current => ({ ...current, business_url: event.target.value || null }))} /></div>
          </ModalBody>
          <ModalFooter><Button variant="outline" onClick={() => setPlatformDialogOpen(false)} disabled={savingPlatform}>Cancel</Button><Button onClick={() => void savePlatform()} disabled={savingPlatform}>{savingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Save platform</Button></ModalFooter>
        </ModalContent>
      </Dialog>
      <DeleteDialog open={Boolean(platformToDelete)} onOpenChange={open => { if (!open) setPlatformToDelete(null); }} onConfirm={deletePlatform} itemType="generic" itemTitle={platformToDelete ? getReputationPlatformLabel(platformToDelete.platform) : undefined} title="Disconnect review platform?" description="This removes the platform connection from Reputation. Existing reviews are retained." confirmText="Disconnect" successTitle="Review platform disconnected" errorDescription="Could not disconnect the review platform. Please try again." />
    </PageLayout>
  );
}

export default ReputationSettingsPage;
