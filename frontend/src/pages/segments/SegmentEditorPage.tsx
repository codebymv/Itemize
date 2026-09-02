import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Eye,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Users,
} from "lucide-react";
import { debounce } from "lodash";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { OrganizationErrorState } from "@/components/OrganizationErrorState";
import { HeaderAction } from "@/components/layout/DesktopHeaderTools";
import { PageLayout } from "@/components/layout/PageLayout";
import { EntityDetailHeader } from "@/components/layout/EntityDetailHeader";
import { ShellBackButton } from "@/components/layout/ShellBackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/ui/page-loading";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SectionCardTitle } from "@/components/ui/section-card-title";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilitySettingRow } from "@/components/settings/SettingsPrimitives";
import { useOrganization } from "@/hooks/useOrganization";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useSingleFlightAction } from "@/hooks/useSingleFlightAction";
import { useStableMutationKey } from "@/hooks/useStableMutationKey";
import { useToast } from "@/hooks/use-toast";
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from "@/lib/queryPolicy";
import { cn } from "@/lib/utils";
import { getCatalogStatusVisual } from "@/pages/campaigns/constants/campaignVisuals";
import {
  createSegment,
  previewSegment,
  updateSegment,
  type FilterOptions,
  type Segment,
  type SegmentFilter,
  type SegmentPreview,
} from "@/services/segmentsApi";
import { segmentQueryKeys } from "@/services/segmentQueryKeys";
import {
  getSegmentEditorBootstrapViaGraphql,
  type SegmentEditorBootstrapData,
} from "@/services/segmentsGraphql";
import { SegmentFilterRow } from "./SegmentFilterRow";

type SegmentForm = {
  name: string;
  description: string;
  filterType: "and" | "or";
  isActive: boolean;
};
const EMPTY_FORM: SegmentForm = {
  name: "",
  description: "",
  filterType: "and",
  isActive: true,
};
const editorKey = (form: SegmentForm, filters: SegmentFilter[]) =>
  JSON.stringify({ form, filters });

export function SegmentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    organizationId,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganization();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [form, setForm] = useState<SegmentForm>(EMPTY_FORM);
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [savedKey, setSavedKey] = useState(editorKey(EMPTY_FORM, []));
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const { pending: saving, run: runSave } = useSingleFlightAction();
  const createAttempt = useStableMutationKey("create-segment");
  const [previewing, setPreviewing] = useState(false);
  const parsedSegmentId = Number(id);
  const validSegmentId = !isNew
    && Number.isSafeInteger(parsedSegmentId)
    && parsedSegmentId > 0
    ? parsedSegmentId
    : null;
  const invalidSegmentId = !isNew && validSegmentId === null;
  const bootstrapIdentity = `${organizationId ?? "none"}:${validSegmentId ?? "new"}`;
  const initializedBootstrapRef = useRef<string | null>(null);
  const bootstrapQueryKey = segmentQueryKeys.editor(organizationId, validSegmentId);
  const bootstrapQuery = useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: ({ signal }) => getSegmentEditorBootstrapViaGraphql(
      organizationId as number,
      validSegmentId,
      signal,
    ),
    enabled: organizationId !== null && !invalidSegmentId,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });

  useEffect(() => {
    if (!bootstrapQuery.data || initializedBootstrapRef.current === bootstrapIdentity) return;
    const { filterOptions, segment: loadedSegment } = bootstrapQuery.data;
    setOptions(filterOptions);
    setSegment(loadedSegment);
    const nextForm = loadedSegment
      ? {
          name: loadedSegment.name,
          description: loadedSegment.description || "",
          filterType: loadedSegment.filter_type,
          isActive: loadedSegment.is_active,
        }
      : EMPTY_FORM;
    const nextFilters = loadedSegment?.filters || [];
    setForm(nextForm);
    setFilters(nextFilters);
    setSavedKey(editorKey(nextForm, nextFilters));
    setPreview(loadedSegment ? { count: loadedSegment.contact_count, sample: [] } : null);
    initializedBootstrapRef.current = bootstrapIdentity;
  }, [bootstrapIdentity, bootstrapQuery.data]);

  const loading = orgLoading
    || (!invalidSegmentId && organizationId !== null && bootstrapQuery.isPending)
    || (bootstrapQuery.isSuccess && initializedBootstrapRef.current !== bootstrapIdentity);
  const loadError = invalidSegmentId
    ? "This segment link is invalid."
    : bootstrapQuery.isError
      ? "We could not load this segment. No changes were made."
      : null;

  const isStatic = segment?.segment_type === "static";
  const dirty = editorKey(form, filters) !== savedKey;
  const { confirmLeave } = useUnsavedChangesGuard({
    when: dirty || saving,
    message: "This segment has unsaved changes. Leave this page anyway?",
  });
  const goBack = () => {
    if (confirmLeave()) navigate("/segments");
  };

  const fetchPreview = useMemo(
    () =>
      debounce(
        async (nextFilters: SegmentFilter[], filterType: "and" | "or") => {
          if (!organizationId || isStatic || nextFilters.length === 0) {
            if (!isStatic) setPreview(null);
            return;
          }
          const complete = nextFilters.every(
            (filter) =>
              filter.field &&
              filter.operator &&
              (filter.operator === "is_empty" ||
                filter.operator === "is_not_empty" ||
                (filter.value !== undefined && filter.value !== "")),
          );
          if (!complete) {
            setPreview(null);
            return;
          }
          setPreviewing(true);
          try {
            setPreview(
              await previewSegment(nextFilters, filterType, organizationId),
            );
          } catch {
            setPreview(null);
          } finally {
            setPreviewing(false);
          }
        },
        400,
      ),
    [isStatic, organizationId],
  );

  useEffect(() => {
    void fetchPreview(filters, form.filterType);
    return () => fetchPreview.cancel();
  }, [fetchPreview, filters, form.filterType]);

  const addCondition = () => {
    const field = options?.fields[0];
    if (!field) return;
    setFilters((current) => [
      ...current,
      { field: field.id, operator: field.operators[0] || "equals", value: "" },
    ]);
  };

  const handleSave = async () => {
    if (!organizationId) return;
    if (!form.name.trim()) {
      toast({
        title: "Segment name required",
        description: "Add a clear name before saving.",
        variant: "destructive",
      });
      return;
    }
    if (!isStatic && filters.length === 0) {
      toast({
        title: "Matching rule required",
        description: "Add at least one condition for this dynamic segment.",
        variant: "destructive",
      });
      return;
    }
    const incomplete =
      !isStatic &&
      filters.some(
        (filter) =>
          !filter.field ||
          !filter.operator ||
          (filter.operator !== "is_empty" &&
            filter.operator !== "is_not_empty" &&
            (filter.value === undefined || filter.value === "")),
      );
    if (incomplete) {
      toast({
        title: "Complete the matching rules",
        description: "Every condition needs a field, rule, and value.",
        variant: "destructive",
      });
      return;
    }
    await runSave(async () => {
      const payload: Partial<Segment> = isStatic
        ? {
            name: form.name.trim(),
            description: form.description.trim(),
            is_active: form.isActive,
          }
        : {
            name: form.name.trim(),
            description: form.description.trim(),
            filter_type: form.filterType,
            filters,
            segment_type: "dynamic",
            is_active: form.isActive,
          };
      const creationKey = segment ? null : createAttempt.begin(JSON.stringify(payload));
      if (!segment && !creationKey) return;
      let saved: Segment;
      try {
        saved = segment
          ? await updateSegment(segment.id, payload, organizationId)
          : await createSegment(payload, organizationId, creationKey as string);
      } catch {
        if (creationKey) createAttempt.release();
        toast({
          title: "Unable to save segment",
          description: "Your changes remain in the editor.",
          variant: "destructive",
        });
        return;
      }
      if (creationKey) createAttempt.reset();
      queryClient.setQueryData<Segment[]>(
        segmentQueryKeys.catalog(organizationId),
        current => {
          if (!current) return current;
          const exists = current.some(item => item.id === saved.id);
          return exists
            ? current.map(item => item.id === saved.id ? saved : item)
            : [saved, ...current];
        },
      );
      if (options) {
        queryClient.setQueryData<SegmentEditorBootstrapData>(
          segmentQueryKeys.editor(organizationId, saved.id),
          { segment: saved, filterOptions: options },
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["campaign-editor-bootstrap"] });
      setSegment(saved);
      const nextForm = {
        name: saved.name,
        description: saved.description || "",
        filterType: saved.filter_type,
        isActive: saved.is_active,
      };
      const nextFilters = saved.filters || [];
      setForm(nextForm);
      setFilters(nextFilters);
      setSavedKey(editorKey(nextForm, nextFilters));
      if (isNew) navigate(`/segments/${saved.id}`, { replace: true });
      toast({
        title: segment ? "Segment saved" : "Segment created",
        description: "The audience definition is up to date.",
      });
    });
  };

  const visual = getCatalogStatusVisual(segment?.is_active ?? true);
  const TypeIcon = isStatic ? Users : RefreshCw;
  const leading = <ShellBackButton label="Back to segments" onClick={goBack} />;

  if (orgError || loadError)
    return (
      <PageLayout
        title="SEGMENT"
        icon={<Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
        leading={leading}
      >
        {orgError ? (
          <OrganizationErrorState
            title="Unable to load segment"
            icon={Filter}
          />
        ) : (
          <ErrorState
            kind="page"
            title="Segment unavailable"
            description={loadError || undefined}
            icon={Filter}
            onAction={() => void bootstrapQuery.refetch()}
          />
        )}
      </PageLayout>
    );
  if (loading || orgLoading || !organizationId)
    return (
      <PageLayout
        title="SEGMENT"
        icon={<Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
        leading={leading}
      >
        <PageLoading message="Loading segment..." />
      </PageLayout>
    );

  return (
    <PageLayout
      title={isNew ? "NEW SEGMENT" : "SEGMENT"}
      icon={
        <Filter className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      }
      leading={leading}
      headerTools={{
        status: segment ? (
          <Badge
            className={cn(
              "pointer-events-none whitespace-nowrap",
              visual.badgeClass,
            )}
          >
            {visual.label}
          </Badge>
        ) : undefined,
        primaryAction: (
          <HeaderAction
            label={
              saving ? "Saving..." : isNew ? "Create segment" : "Save changes"
            }
            icon={
              saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )
            }
            disabled={!dirty || saving}
            busy={saving}
            onClick={() => void handleSave()}
          />
        ),
      }}
    >
      <EntityDetailHeader
        icon={<TypeIcon className={cn("h-6 w-6", visual.iconClass)} />}
        iconClassName={visual.iconBackgroundClass}
        title={form.name || "New segment"}
        mobileStatus={
          segment ? (
            <Badge className={visual.badgeClass}>{visual.label}</Badge>
          ) : undefined
        }
        descriptor={
          form.description ||
          (isStatic
            ? "A saved group of selected contacts"
            : "A rule-based audience that stays up to date")
        }
        metadata={
          <>
            <span>{isStatic ? "Static segment" : "Dynamic segment"}</span>
            {segment ? (
              <span>
                {segment.contact_count} contact
                {segment.contact_count === 1 ? "" : "s"}
              </span>
            ) : (
              <span>Not saved yet</span>
            )}
            {segment && segment.used_in_campaigns > 0 && (
              <span>
                {segment.used_in_campaigns} campaign
                {segment.used_in_campaigns === 1 ? "" : "s"}
              </span>
            )}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <SectionCardTitle icon={Settings2}>
                Segment settings
              </SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset" className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="segment-name">Name</Label>
                <Input
                  id="segment-name"
                  value={form.name}
                  placeholder="Active customers"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              {!isStatic && (
                <div className="space-y-2">
                  <Label>Match conditions</Label>
                  <RadioGroup
                    value={form.filterType}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        filterType: value as "and" | "or",
                      }))
                    }
                    className="grid h-11 grid-cols-2 gap-0 overflow-hidden rounded-md border"
                  >
                    <Label
                      htmlFor="segment-and"
                      className="flex h-full cursor-pointer items-center gap-2 px-3"
                    >
                      <RadioGroupItem value="and" id="segment-and" />
                      Match all
                    </Label>
                    <Label
                      htmlFor="segment-or"
                      className="flex h-full cursor-pointer items-center gap-2 border-l px-3"
                    >
                      <RadioGroupItem value="or" id="segment-or" />
                      Match any
                    </Label>
                  </RadioGroup>
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="segment-description">Description</Label>
                <Textarea
                  id="segment-description"
                  className="min-h-20"
                  value={form.description}
                  placeholder="Describe who belongs in this audience"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <AvailabilitySettingRow
                id="segment-active"
                label="Available for campaigns"
                checked={form.isActive}
                onCheckedChange={(isActive) =>
                  setForm((current) => ({ ...current, isActive }))
                }
                help="Unavailable segments remain editable but cannot be selected for new campaigns."
                helpLabel="About segment availability"
                className="sm:col-span-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <SectionCardTitle icon={Filter}>
                {isStatic ? "Saved membership" : "Matching rules"}
              </SectionCardTitle>
              {!isStatic && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCondition}
                  disabled={!options?.fields.length}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add condition
                </Button>
              )}
            </CardHeader>
            <CardContent surface="inset">
              {isStatic ? (
                <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  This segment contains explicitly selected contacts. Editing
                  its details will not change that saved membership.
                </p>
              ) : filters.length === 0 ? (
                <EmptyState
                  icon={Filter}
                  kind="inline"
                  title="No matching rules yet"
                />
              ) : (
                <div className="space-y-3">
                  {filters.map((filter, index) => (
                    <div key={index} className="space-y-3">
                      {index > 0 && (
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-border" />
                          <Badge variant="outline">
                            {form.filterType.toUpperCase()}
                          </Badge>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <SegmentFilterRow
                        filter={filter}
                        index={index}
                        fields={options?.fields || []}
                        filterOptions={options!}
                        onChange={(row, value) =>
                          setFilters((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === row ? value : item,
                            ),
                          )
                        }
                        onRemove={(row) =>
                          setFilters((current) =>
                            current.filter((_, itemIndex) => itemIndex !== row),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <SectionCardTitle icon={Eye}>Audience preview</SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset">
              {previewing ? (
                <div className="flex min-h-28 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold text-blue-600 dark:text-blue-400">
                        {preview?.count ??
                          (isStatic ? (segment?.contact_count ?? 0) : "—")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        matching contacts
                      </p>
                    </div>
                    {preview && (
                      <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  {preview?.sample.length ? (
                    <div className="mt-5 space-y-3 border-t pt-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Sample contacts
                      </p>
                      {preview.sample.slice(0, 5).map((contact) => (
                        <div key={contact.id} className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {[contact.first_name, contact.last_name]
                              .filter(Boolean)
                              .join(" ") ||
                              contact.email ||
                              "Unnamed contact"}
                          </p>
                          {contact.email && (
                            <p className="truncate text-xs text-muted-foreground">
                              {contact.email}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !isStatic && (
                      <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                        Complete the matching rules to preview this audience.
                      </p>
                    )
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}

export default SegmentEditorPage;
