import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Code2, Copy, LayoutGrid, Loader2, Palette, Save, Settings2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PreviewPlaceholder } from '@/components/preview/PreviewPlaceholder';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { HeaderAction, HeaderModeNavigation } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
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
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  createReviewWidget,
  getReviewWidgets,
  getReviews,
  getWidgetEmbedCode,
  updateReviewWidget,
  type Review,
  type ReviewWidget,
} from '@/services/reputationApi';
import { ReputationWidgetPreview } from './components/ReputationWidgetPreview';
import { getReputationPlatformLabel, getReviewWidgetAvailabilityVisual, REPUTATION_PLATFORM_LABELS, type ReputationPlatformKey } from './constants/reputationVisuals';

type WidgetDraft = Omit<ReviewWidget, 'id' | 'organization_id' | 'widget_key' | 'created_at' | 'updated_at'>;
type EditorMode = 'settings' | 'appearance' | 'install';

const DEFAULT_DRAFT: WidgetDraft = {
  name: 'New review widget',
  widget_type: 'carousel',
  theme: 'auto',
  primary_color: '#2563EB',
  background_color: '#FFFFFF',
  text_color: '#0F172A',
  border_radius: 12,
  show_rating_stars: true,
  show_reviewer_photo: true,
  show_review_date: true,
  show_platform_icon: true,
  min_rating: 4,
  platforms: [],
  max_reviews: 6,
  hide_no_text_reviews: true,
  auto_refresh: true,
  refresh_interval_hours: 24,
  is_active: true,
};

const MODES = [
  { value: 'settings', label: 'Settings', icon: Settings2 },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'install', label: 'Install', icon: Code2 },
] as const;

const WIDGET_TYPES: Array<ReviewWidget['widget_type']> = ['carousel', 'grid', 'list', 'badge', 'floating'];
const PLATFORM_KEYS = Object.keys(REPUTATION_PLATFORM_LABELS) as ReputationPlatformKey[];
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function ReputationWidgetEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const widgetId = isNew ? null : Number(id);
  const { toast } = useToast();
  const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [draft, setDraft] = useState<WidgetDraft>(DEFAULT_DRAFT);
  const [widget, setWidget] = useState<ReviewWidget | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [embedCode, setEmbedCode] = useState('');
  const [mode, setMode] = useState<EditorMode>('settings');
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { isDirty, markClean } = useDirtyState({ value: draft, ready: !loading, resetKey: widget?.id ?? 'new' });
  const { confirmLeave } = useUnsavedChangesGuard({ when: isDirty || saving, message: 'This widget has unsaved changes. Leave without saving them?' });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [widgets, reviewResult] = await Promise.all([
        getReviewWidgets(organizationId),
        getReviews({ limit: 12 }, organizationId).catch(() => ({ reviews: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } })),
      ]);
      setReviews(reviewResult.reviews);
      if (isNew) {
        setDraft(DEFAULT_DRAFT);
        setWidget(null);
        return;
      }
      if (!Number.isSafeInteger(widgetId) || (widgetId ?? 0) < 1) throw new Error('Invalid widget ID.');
      const selected = widgets.find(item => item.id === widgetId);
      if (!selected) throw new Error('Widget not found.');
      const { id: _id, organization_id: _organizationId, widget_key: _widgetKey, created_at: _createdAt, updated_at: _updatedAt, ...values } = selected;
      setWidget(selected);
      setDraft(values);
      try {
        const embed = await getWidgetEmbedCode(selected.id, organizationId);
        setEmbedCode(embed.embed_code);
      } catch {
        setEmbedCode('');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load this widget.');
    } finally {
      setLoading(false);
    }
  }, [isNew, organizationId, widgetId]);

  useEffect(() => { if (organizationId) void load(); }, [load, organizationId]);

  const updateDraft = <K extends keyof WidgetDraft>(field: K, value: WidgetDraft[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!organizationId || saving) return;
    if (!draft.name.trim()) {
      toast({ title: 'Enter a widget name', variant: 'destructive' });
      return;
    }
    if (![draft.primary_color, draft.background_color, draft.text_color].every(isHexColor)) {
      toast({ title: 'Use six-digit hex colors', description: 'For example, #2563EB.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, name: draft.name.trim() };
      const saved = widget
        ? await updateReviewWidget(widget.id, payload, organizationId)
        : await createReviewWidget(payload, organizationId);
      const { id: _id, organization_id: _organizationId, widget_key: _widgetKey, created_at: _createdAt, updated_at: _updatedAt, ...savedDraft } = saved;
      setWidget(saved);
      setDraft(savedDraft);
      markClean(savedDraft);
      const embed = await getWidgetEmbedCode(saved.id, organizationId).catch(() => null);
      setEmbedCode(embed?.embed_code ?? '');
      toast({ title: 'Review widget saved' });
      if (isNew) navigate(`/review-widgets/${saved.id}`, { replace: true });
    } catch {
      toast({ title: 'Could not save widget', variant: 'destructive' });
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

  const statusVisual = getReviewWidgetAvailabilityVisual(widget?.is_active ?? draft.is_active);
  const StatusIcon = statusVisual.icon;
  const saveDisabled = saving || (!isNew && !isDirty);
  const backButton = <ShellBackButton label="Back to widgets" onClick={() => { if (confirmLeave()) navigate('/review-widgets'); }} />;

  if (initError || loadError) {
    return (
      <PageLayout title="REVIEW WIDGET" icon={<LayoutGrid className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />} leading={backButton}>
        {initError ? (
          <OrganizationErrorState title="Unable to load review widget" icon={LayoutGrid} />
        ) : (
          <ErrorState kind="page" title="Review widget unavailable" description={loadError || undefined} onAction={() => void load()} />
        )}
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout title="REVIEW WIDGET" icon={<LayoutGrid className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />} leading={backButton} className="max-w-7xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]"><Skeleton className="h-[38rem]" /><Skeleton className="h-[38rem]" /></div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="REVIEW WIDGET"
      icon={<LayoutGrid className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={backButton}
      className="max-w-7xl"
      headerTools={{
        modeNavigation: <HeaderModeNavigation label="Review widget mode" value={mode} onValueChange={value => setMode(value as EditorMode)} items={[...MODES]} />,
        status: widget ? <Badge className={cn('pointer-events-none whitespace-nowrap', statusVisual.badgeClass)}>{statusVisual.label}</Badge> : undefined,
        primaryAction: <HeaderAction label={saving ? 'Saving...' : 'Save changes'} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={() => void save()} disabled={saveDisabled} />,
      }}
    >
      <EntityDetailHeader
        icon={<StatusIcon className={cn('h-6 w-6', statusVisual.iconClass)} />}
        iconClassName={statusVisual.iconBackgroundClass}
        title={draft.name || 'New review widget'}
        mobileStatus={widget ? <Badge className={statusVisual.badgeClass}>{statusVisual.label}</Badge> : undefined}
        descriptor={getReputationPlatformLabel(draft.widget_type)}
        metadata={widget ? <><span>{draft.min_rating}+ stars</span><span>Up to {draft.max_reviews} reviews</span></> : undefined}
      />

      <Tabs value={mode} onValueChange={value => setMode(value as EditorMode)}>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="order-2 min-w-0 xl:order-1">
            <TabsContent value="settings" className="mt-0 space-y-6">
              <Card>
                <CardHeader><SectionCardTitle icon={Settings2}>Widget settings</SectionCardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <AvailabilitySettingRow id="review-widget-active" label="Available on installed sites" checked={draft.is_active} onCheckedChange={value => updateDraft('is_active', value)} help="Unavailable widgets retain their settings but do not render on installed sites." helpLabel="About widget availability" />
                  <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
                    <div className="grid gap-2"><Label htmlFor="widget-name">Name</Label><Input id="widget-name" value={draft.name} onChange={event => updateDraft('name', event.target.value)} /></div>
                    <div className="grid gap-2"><Label htmlFor="widget-type">Type</Label><Select value={draft.widget_type} onValueChange={value => updateDraft('widget_type', value as ReviewWidget['widget_type'])}><SelectTrigger id="widget-type"><SelectValue /></SelectTrigger><SelectContent>{WIDGET_TYPES.map(type => <SelectItem key={type} value={type}>{getReputationPlatformLabel(type)}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-2"><Label htmlFor="widget-min-rating">Minimum rating</Label><Select value={String(draft.min_rating)} onValueChange={value => updateDraft('min_rating', Number(value))}><SelectTrigger id="widget-min-rating"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map(rating => <SelectItem key={rating} value={String(rating)}>{rating}+ stars</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-2"><Label htmlFor="widget-max-reviews">Maximum reviews</Label><Input id="widget-max-reviews" type="number" min={1} max={100} value={draft.max_reviews} onChange={event => updateDraft('max_reviews', Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></div>
                  </div>
              </CardContent>
              </Card>

              <Card>
                <CardHeader><SectionCardTitle icon={Star}>Review selection</SectionCardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <SettingsFieldLabel help="Leave every option unchecked to include reviews from all sources." helpLabel="About platform selection">Platforms</SettingsFieldLabel>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {PLATFORM_KEYS.map(platform => {
                        const checked = draft.platforms.includes(platform);
                        return <label key={platform} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><Checkbox checked={checked} onCheckedChange={value => updateDraft('platforms', value ? [...draft.platforms, platform] : draft.platforms.filter(item => item !== platform))} /><span className="text-sm">{REPUTATION_PLATFORM_LABELS[platform]}</span></label>;
                      })}
                    </div>
                  </div>
                  <div className="grid divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <div className="flex items-center justify-between gap-3 p-3"><Label htmlFor="widget-hide-empty">Require review text</Label><Switch id="widget-hide-empty" checked={draft.hide_no_text_reviews} onCheckedChange={value => updateDraft('hide_no_text_reviews', value)} /></div>
                    <div className="flex items-center justify-between gap-3 p-3"><Label htmlFor="widget-refresh">Auto refresh</Label><Switch id="widget-refresh" checked={draft.auto_refresh} onCheckedChange={value => updateDraft('auto_refresh', value)} /></div>
                  </div>
                  {draft.auto_refresh ? <div className="grid gap-2 sm:max-w-xs"><Label htmlFor="widget-refresh-hours">Refresh interval (hours)</Label><Input id="widget-refresh-hours" type="number" min={1} max={168} value={draft.refresh_interval_hours} onChange={event => updateDraft('refresh_interval_hours', Math.max(1, Math.min(168, Number(event.target.value) || 1)))} /></div> : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 space-y-6">
              <Card>
                <CardHeader><SectionCardTitle icon={Palette}>Appearance</SectionCardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label htmlFor="widget-theme">Theme</Label><Select value={draft.theme} onValueChange={value => updateDraft('theme', value as ReviewWidget['theme'])}><SelectTrigger id="widget-theme"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></div>
                    <div className="grid gap-2"><Label htmlFor="widget-radius">Corner radius</Label><Input id="widget-radius" type="number" min={0} max={32} value={draft.border_radius} onChange={event => updateDraft('border_radius', Math.max(0, Math.min(32, Number(event.target.value) || 0)))} /></div>
                    {([['primary_color', 'Accent color'], ['background_color', 'Background color'], ['text_color', 'Text color']] as const).map(([field, label]) => <div key={field} className="grid gap-2"><Label htmlFor={`widget-${field}`}>{label}</Label><div className="flex gap-2"><Input type="color" id={`widget-${field}`} value={draft[field]} onChange={event => updateDraft(field, event.target.value.toUpperCase())} className="w-14 shrink-0 p-1" /><Input aria-label={`${label} value`} value={draft[field]} onChange={event => updateDraft(field, event.target.value)} /></div></div>)}
                  </div>
                  <div className="grid divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    {([['show_rating_stars', 'Rating stars'], ['show_reviewer_photo', 'Reviewer photo'], ['show_review_date', 'Review date'], ['show_platform_icon', 'Platform icon']] as const).map(([field, label]) => <div key={field} className="flex items-center justify-between gap-3 p-3"><Label htmlFor={`widget-${field}`}>{label}</Label><Switch id={`widget-${field}`} checked={draft[field]} onCheckedChange={value => updateDraft(field, value)} /></div>)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="install" className="mt-0">
              <Card>
                <CardHeader><SectionCardTitle icon={Code2}>Install widget</SectionCardTitle></CardHeader>
                <CardContent>
                  {embedCode ? <div className="relative"><pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 pr-24 text-sm"><code>{embedCode}</code></pre><Button variant="outline" size="sm" className="absolute right-2 top-2" onClick={() => void copyEmbedCode()}><Copy className="mr-2 h-4 w-4" />Copy</Button></div> : <PreviewPlaceholder icon={Code2} title="Save to generate install code" action={<Button type="button" onClick={() => void save()} className="h-11 bg-blue-600 text-white hover:bg-blue-700">Save widget</Button>} />}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
          <aside className="order-1 min-w-0 xl:order-2 xl:sticky xl:top-20"><ReputationWidgetPreview config={draft} reviews={reviews} /></aside>
        </div>
      </Tabs>
    </PageLayout>
  );
}

export default ReputationWidgetEditorPage;
