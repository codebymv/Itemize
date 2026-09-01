import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  Crown,
  Globe2,
  History,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { FailureNotice } from '@/components/FailureNotice';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import {
  SettingsFieldLabel,
  SettingsInfoTooltip,
  SettingsSectionTitle,
} from '@/components/settings/SettingsPrimitives';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthState } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/organization-context';
import { useSubscriptionFeatures, useSubscriptionState } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import {
  createOrganization,
  deleteOrganization,
  getOrganizationActivity,
  getOrganizationInvitations,
  getOrganizationMembers,
  getViewerOrganizationAllowance,
  inviteMember,
  leaveOrganization,
  removeMember,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  transferOrganizationOwnership,
  updateMemberRole,
  updateOrganization,
} from '@/services/contactsApi';
import type {
  OrganizationActivity,
  OrganizationAllowance,
} from '@/services/organizationsGraphql';
import { getBusiness, getBusinessPage, type Business } from '@/services/invoicesApi';
import type { JsonRecord, OrganizationInvitation, OrganizationMember } from '@/types';
import { AVAILABLE_PLANS_PATH } from '@/lib/settingsNavigation';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const LOCALES = [
  ['en-US', 'English (United States)'],
  ['en-CA', 'English (Canada)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-AU', 'English (Australia)'],
] as const;

const roleLabel = (role: OrganizationMember['role']) =>
  role.charAt(0).toUpperCase() + role.slice(1);

const initials = (member: OrganizationMember) => {
  const value = member.user_name?.trim() || member.email || 'Member';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};

const settingString = (settings: JsonRecord, key: string, fallback: string) =>
  typeof settings[key] === 'string' ? String(settings[key]) : fallback;

const settingId = (settings: JsonRecord, key: string) =>
  typeof settings[key] === 'number' && Number.isSafeInteger(settings[key])
    ? Number(settings[key])
    : null;

const activityDescription = (activity: OrganizationActivity): string => {
  const actor = activity.actorName || activity.actorEmail || 'A former member';
  const target = activity.targetName || activity.targetEmail || 'another member';
  const role = typeof activity.payload.role === 'string'
    ? activity.payload.role
    : 'member';
  const previousRole = typeof activity.payload.previousRole === 'string'
    ? activity.payload.previousRole
    : 'member';
  switch (activity.eventType) {
    case 'organization.created':
      return `${actor} created the organization.`;
    case 'organization.updated':
      return `${actor} updated the organization.`;
    case 'organization.member_added':
      return `${actor} added ${target} as ${role}.`;
    case 'organization.member_role_changed':
      return `${actor} changed ${target} from ${previousRole} to ${role}.`;
    case 'organization.member_removed':
      return `${actor} removed ${target} from the organization.`;
    case 'organization.member_left':
      return `${actor} left the organization.`;
    case 'organization.invitation_created':
      return `${actor} invited ${target} as ${role}.`;
    case 'organization.invitation_resent':
      return `${actor} resent ${target}'s invitation.`;
    case 'organization.invitation_revoked':
      return `${actor} revoked ${target}'s invitation.`;
    case 'organization.invitation_accepted':
      return `${target} joined the organization as ${role}.`;
    case 'organization.ownership_transferred':
      return `${actor} transferred organization ownership to ${target}.`;
    default:
      return `${actor} changed the organization.`;
  }
};

export function OrganizationSettings({
  setSaveButton,
}: {
  setSaveButton?: (button: ReactNode) => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuthState();
  const { subscription } = useSubscriptionState();
  const { refreshSubscription } = useSubscriptionFeatures();
  const {
    organization,
    organizationId,
    organizations,
    refresh,
    selectOrganization,
  } = useOrganizationContext();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en-US');
  const [defaultBusinessId, setDefaultBusinessId] = useState<number | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [activity, setActivity] = useState<OrganizationActivity[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessProfilesAvailable, setBusinessProfilesAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detailsLoadError, setDetailsLoadError] = useState(false);
  const { pending: saving, run: runSave } = useSingleFlightAction();
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberActionId, setMemberActionId] = useState<number | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [lifecycleAction, setLifecycleAction] = useState<'leave' | 'delete' | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [allowance, setAllowance] = useState<OrganizationAllowance | null>(null);
  const [allowanceLoading, setAllowanceLoading] = useState(true);
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  const currentRole = organization?.role ?? 'viewer';
  const canManage = currentRole === 'owner' || currentRole === 'admin';
  const isOwner = currentRole === 'owner';
  const currentUserId = Number(currentUser?.uid);
  const memberLimit = subscription?.limits?.users;
  const hasMemberLimit = typeof memberLimit === 'number' && memberLimit >= 0;
  const activeInvitationCount = invitations.filter((invitation) => invitation.status === 'pending').length;
  const usedSeats = members.length + activeInvitationCount;
  const memberLimitReached = hasMemberLimit && usedSeats >= memberLimit;
  const visibleActivity = activityExpanded ? activity : activity.slice(0, 3);

  useEffect(() => {
    if (!organization) return;
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const browserLocale = navigator.language || 'en-US';
    setName(organization.name);
    setTimezone(settingString(organization.settings, 'timezone', browserTimezone));
    setLocale(settingString(organization.settings, 'locale', browserLocale));
    setDefaultBusinessId(settingId(organization.settings, 'defaultBusinessId'));
  }, [organization]);

  const loadDetails = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setDetailsLoadError(false);
    const configuredDefaultBusinessId = settingId(
      organization.settings,
      'defaultBusinessId',
    );
    const loadBusinessChoices = async (): Promise<Business[]> => {
      const firstPage = await getBusinessPage(1, 100, organizationId);
      if (
        configuredDefaultBusinessId == null
        || firstPage.businesses.some(
          (business) => business.id === configuredDefaultBusinessId,
        )
      ) {
        return firstPage.businesses;
      }
      try {
        const configuredBusiness = await getBusiness(
          configuredDefaultBusinessId,
          organizationId,
        );
        return [...firstPage.businesses, configuredBusiness];
      } catch {
        return firstPage.businesses;
      }
    };
    try {
      const [membersResult, invitationsResult, businessesResult, activityResult] = await Promise.allSettled([
        getOrganizationMembers(organizationId),
        canManage ? getOrganizationInvitations(organizationId) : Promise.resolve([]),
        loadBusinessChoices(),
        canManage ? getOrganizationActivity(organizationId, 20) : Promise.resolve([]),
      ]);
      if (membersResult.status === 'rejected') throw membersResult.reason;
      setMembers(membersResult.value);
      if (invitationsResult.status === 'fulfilled') {
        setInvitations(invitationsResult.value);
      } else {
        setInvitations([]);
      }
      if (businessesResult.status === 'fulfilled') {
        setBusinesses(businessesResult.value);
        setBusinessProfilesAvailable(true);
      } else {
        setBusinesses([]);
        setBusinessProfilesAvailable(false);
      }
      setActivity(activityResult.status === 'fulfilled' ? activityResult.value : []);
    } catch (error) {
      setDetailsLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [canManage, organization.settings, organizationId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    setActivityExpanded(false);
  }, [organizationId]);

  const loadAllowance = useCallback(async () => {
    setAllowanceLoading(true);
    try {
      setAllowance(await getViewerOrganizationAllowance());
    } catch (error) {
      setAllowance(null);
      toast({
        title: 'Organization allowance unavailable',
        description: error instanceof Error ? error.message : 'Could not load organization ownership details.',
        variant: 'destructive',
      });
    } finally {
      setAllowanceLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAllowance();
  }, [loadAllowance]);

  const availableTimezones = useMemo(() => {
    return TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];
  }, [timezone]);

  const handleSave = useCallback(async () => {
    if (!organizationId || !organization || !canManage) return;
    if (!name.trim()) {
      toast({ title: 'Organization name required', variant: 'destructive' });
      return;
    }
    await runSave(async () => {
      try {
        const settings: JsonRecord = {
          ...organization.settings,
          timezone,
          locale,
          defaultBusinessId,
        };
        await updateOrganization(organizationId, { name: name.trim(), settings });
        await refresh();
        toast({ title: 'Organization saved' });
      } catch (error) {
        toast({
          title: 'Could not save organization',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    });
  }, [canManage, defaultBusinessId, locale, name, organization, organizationId, refresh, runSave, timezone, toast]);

  useEffect(() => {
    if (!setSaveButton) return;

    if (!canManage) {
      setSaveButton(null);
      return () => setSaveButton(null);
    }

    setSaveButton(
      <HeaderAction
        label={saving ? 'Saving…' : 'Save changes'}
        onClick={() => void handleSave()}
        disabled={saving}
        busy={saving}
        icon={saving
          ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          : <Save aria-hidden="true" className="h-4 w-4" />}
      />,
    );

    return () => setSaveButton(null);
  }, [canManage, handleSave, saving, setSaveButton]);

  const handleCreateOrganization = async () => {
    const trimmedName = organizationName.trim();
    if (!trimmedName || !allowance?.canCreate) return;
    setCreatingOrganization(true);
    try {
      const created = await createOrganization({ name: trimmedName });
      await refresh();
      await selectOrganization(created.id);
      await loadAllowance();
      setOrganizationName('');
      setCreateOrganizationOpen(false);
      toast({ title: `${created.name} created`, description: 'Your new organization starts on Free.' });
    } catch (error) {
      toast({
        title: 'Could not create organization',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingOrganization(false);
    }
  };

  const handleAddMember = async () => {
    if (!organizationId || !email.trim() || !canManage) return;
    setMemberSaving(true);
    try {
      const invitation = await inviteMember(organizationId, email.trim(), inviteRole);
      setEmail('');
      await loadDetails();
      toast({
        title: invitation.delivery_sent ? 'Invitation sent' : 'Invitation created',
        description: invitation.delivery_sent
          ? `A secure link was sent to ${invitation.email}.`
          : 'Email unavailable. Resend when delivery returns.',
      });
    } catch (error) {
      toast({
        title: 'Could not send invitation',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setMemberSaving(false);
    }
  };

  const handleInvitationAction = async (
    invitation: OrganizationInvitation,
    action: 'resend' | 'revoke',
  ) => {
    if (!organizationId) return;
    setInvitationActionId(invitation.id);
    try {
      if (action === 'resend') {
        const resent = await resendOrganizationInvitation(organizationId, invitation.id);
        toast({
          title: resent.delivery_sent ? 'Invitation resent' : 'Invitation renewed',
          description: resent.delivery_sent
            ? `A new secure link was sent to ${invitation.email}.`
            : 'Link renewed, but email delivery is unavailable.',
        });
      } else {
        await revokeOrganizationInvitation(organizationId, invitation.id);
        toast({ title: 'Invitation revoked' });
      }
      await loadDetails();
    } catch (error) {
      toast({
        title: action === 'resend' ? 'Could not resend invitation' : 'Could not revoke invitation',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleRoleChange = async (member: OrganizationMember, role: string) => {
    if (!organizationId) return;
    setMemberActionId(member.id);
    try {
      await updateMemberRole(organizationId, member.id, role);
      await loadDetails();
      toast({ title: 'Role updated' });
    } catch (error) {
      toast({
        title: 'Could not update role',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRemove = async (member: OrganizationMember) => {
    if (!organizationId) return;
    setMemberActionId(member.id);
    try {
      await removeMember(organizationId, member.id);
      await loadDetails();
      toast({ title: 'Member removed' });
    } catch (error) {
      toast({
        title: 'Could not remove member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setMemberActionId(null);
    }
  };

  const handleTransferOwnership = async (member: OrganizationMember) => {
    if (!organizationId || !isOwner) return;
    setMemberActionId(member.id);
    try {
      await transferOrganizationOwnership(organizationId, member.id);
      await Promise.all([refresh(), loadDetails(), loadAllowance(), refreshSubscription()]);
      toast({ title: `Ownership transferred to ${member.user_name || member.email}` });
    } catch (error) {
      toast({
        title: 'Could not transfer ownership',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setMemberActionId(null);
    }
  };

  const handleLifecycle = async (action: 'leave' | 'delete') => {
    if (!organizationId) return;
    setLifecycleAction(action);
    try {
      if (action === 'delete') await deleteOrganization(organizationId);
      else await leaveOrganization(organizationId);
      await refresh();
      await refreshSubscription();
      navigate('/canvas');
      toast({ title: action === 'delete' ? 'Organization deleted' : 'Organization left' });
    } catch (error) {
      toast({
        title: action === 'delete' ? 'Could not delete organization' : 'Could not leave organization',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLifecycleAction(null);
    }
  };

  if (!organization || !organizationId) {
    return <div className="h-48 animate-pulse rounded-lg border bg-muted/40" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <SettingsSectionTitle icon={Globe2}>Your organizations</SettingsSectionTitle>
          {allowance && (
            <Badge variant={allowance.canCreate ? 'secondary' : 'outline'}>
              {allowance.limit < 0
                ? `${allowance.ownedCount} owned · Unlimited`
                : `${allowance.ownedCount} of ${allowance.limit} owned`}
            </Badge>
          )}
        </CardHeader>
        <CardContent surface="inset" className="space-y-4">
          <div className="flex flex-col gap-4 min-[1300px]:flex-row min-[1300px]:items-center min-[1300px]:justify-between">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="text-sm text-muted-foreground">
                You belong to {organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'} and own{' '}
                {allowanceLoading ? '…' : allowance?.ownedCount ?? '—'}.
              </p>
              <SettingsInfoTooltip label="How organization ownership limits work">
                Your highest active plan sets how many organizations you can own: Free 1,
                Solo 3, and Studio unlimited. Each organization keeps separate members,
                billing, features, and Workspace content.
              </SettingsInfoTooltip>
            </div>
            {allowance?.canCreate ? (
              <Dialog open={createOrganizationOpen} onOpenChange={setCreateOrganizationOpen}>
                <DialogTrigger asChild>
                  <Button type="button" className="w-fit" disabled={allowanceLoading}>
                    <Plus className="mr-2 h-4 w-4" />
                    New organization
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create an organization</DialogTitle>
                    <DialogDescription>
                      Starts on Free. Upgrade this organization anytime.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="new-organization-name">New organization name</Label>
                    <Input
                      id="new-organization-name"
                      value={organizationName}
                      maxLength={255}
                      autoFocus
                      disabled={creatingOrganization}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleCreateOrganization();
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={() => void handleCreateOrganization()}
                      disabled={creatingOrganization || !organizationName.trim()}
                    >
                      {creatingOrganization && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create organization
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : allowance ? (
              <Button type="button" variant="outline" className="w-fit" onClick={() => navigate(AVAILABLE_PLANS_PATH)}>
                Review plans
              </Button>
            ) : null}
          </div>
          {allowance && !allowance.canCreate && allowance.limit >= 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
              Upgrade or transfer ownership.
            </p>
          )}
        </CardContent>
      </Card>

      {detailsLoadError ? (
        <FailureNotice
          title="Some organization details are unavailable"
          description="We couldn't refresh members and related organization activity."
          onRetry={() => void loadDetails()}
        />
      ) : null}

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Building2}>Organization details</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset" className="space-y-5">
          <div className="grid gap-2">
            <SettingsFieldLabel
              htmlFor="organization-name"
              help="Used inside Itemize. Customer-facing documents use the business identity selected below."
              helpLabel="About organization names"
            >
              Organization name
            </SettingsFieldLabel>
            <Input
              id="organization-name"
              value={name}
              maxLength={255}
              disabled={!canManage || saving}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="organization-timezone">Time zone</Label>
              <Select value={timezone} onValueChange={setTimezone} disabled={!canManage || saving}>
                <SelectTrigger id="organization-timezone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTimezones.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organization-locale">Locale</Label>
              <Select value={locale} onValueChange={setLocale} disabled={!canManage || saving}>
                <SelectTrigger id="organization-locale"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!LOCALES.some(([value]) => value === locale) && <SelectItem value={locale}>{locale}</SelectItem>}
                  {LOCALES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <SettingsFieldLabel
              id="default-business-label"
              htmlFor="default-business"
              help="Used for new estimates and offered first for new invoices."
              helpLabel="About the default business identity"
            >
              Default business identity
            </SettingsFieldLabel>
            {businessProfilesAvailable && businesses.length > 0 ? (
              <Select
                value={defaultBusinessId?.toString() ?? 'organization'}
                onValueChange={(value) => setDefaultBusinessId(value === 'organization' ? null : Number(value))}
                disabled={!canManage || saving}
              >
                <SelectTrigger id="default-business" aria-label="Default business identity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Use organization name</SelectItem>
                  {businesses.map((business) => (
                    <SelectItem key={business.id} value={business.id.toString()}>{business.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button type="button" variant="outline" className="justify-start" onClick={() => navigate('/payment-settings')}>
                <Plus className="mr-2 h-4 w-4 text-blue-600" />
                {businessProfilesAvailable ? 'Add a business profile' : 'Unlock business profiles'}
              </Button>
            )}
          </div>

          {canManage && !setSaveButton && (
            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving} aria-busy={saving || undefined}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <SettingsSectionTitle icon={Users}>
            <span className="flex items-center gap-1.5">
              Members
              {canManage && (
                <SettingsInfoTooltip label="About organization seats and invitations">
                  Pending invitations reserve a seat and expire after seven days. Expiration
                  dates appear in the invitation list.
                </SettingsInfoTooltip>
              )}
            </span>
          </SettingsSectionTitle>
          {hasMemberLimit && (
            <Badge variant={memberLimitReached ? 'outline' : 'secondary'}>
              {usedSeats} of {memberLimit} seats
            </Badge>
          )}
        </CardHeader>
        <CardContent surface="inset" className="space-y-4">
          {canManage && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <Label htmlFor="member-email" className="sr-only">Member email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                placeholder="teammate@example.com"
                aria-label="Member email"
                disabled={memberLimitReached}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Label htmlFor="member-role" className="sr-only">Member role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as typeof inviteRole)}
                disabled={memberLimitReached}
              >
                <SelectTrigger id="member-role" aria-label="Member role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => void handleAddMember()}
                disabled={memberSaving || memberLimitReached || !email.trim()}
              >
                {memberSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {memberLimitReached ? 'Plan limit reached' : 'Send invite'}
              </Button>
            </div>
          )}

          {canManage && invitations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pending invitations</p>
              <div className="divide-y rounded-lg border">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                      <Send className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {invitation.status === 'expired'
                          ? 'Expired — resend to issue a new secure link'
                          : `Expires ${new Date(invitation.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Badge variant={invitation.status === 'expired' ? 'outline' : 'secondary'}>
                      {invitation.status === 'expired' ? 'Expired' : roleLabel(invitation.role)}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Resend invitation to ${invitation.email}`}
                        disabled={invitationActionId === invitation.id}
                        onClick={() => void handleInvitationAction(invitation, 'resend')}
                      >
                        {invitationActionId === invitation.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke invitation to ${invitation.email}`}
                        disabled={invitationActionId === invitation.id}
                        onClick={() => void handleInvitationAction(invitation, 'revoke')}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted/50" />
          ) : (
            <div className="divide-y rounded-lg border">
              {members.map((member) => {
                const isSelf = member.user_id === currentUserId;
                const canEdit = canManage && member.role !== 'owner' && !isSelf &&
                  (isOwner || member.role !== 'admin');
                const canTransfer = isOwner && member.role !== 'owner' && !isSelf &&
                  Boolean(member.joined_at);
                return (
                  <div key={member.id} className="flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-blue-600 text-sm text-white">{initials(member)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={member.user_name || member.email || 'Member'}>
                        {member.user_name || member.email || 'Member'}
                      </p>
                      {member.user_name && (
                        <p className="truncate text-xs text-muted-foreground" title={member.email}>
                          {member.email}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                      {canEdit ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => void handleRoleChange(member, value)}
                          disabled={memberActionId === member.id}
                        >
                          <SelectTrigger className="h-9 w-28" aria-label={`Role for ${member.email}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                      )}
                      {canTransfer && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Transfer ownership to ${member.email}`}
                              disabled={memberActionId === member.id}
                            >
                              <Crown className="h-4 w-4 text-amber-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Transfer ownership to {member.user_name || member.email}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                They will become the organization owner. You will remain a member with the Admin role.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void handleTransferOwnership(member)}
                                disabled={memberActionId !== null}
                              >
                                Transfer ownership
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {canEdit && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${member.email}`}
                              disabled={memberActionId === member.id}
                            >
                              {memberActionId === member.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4 text-destructive" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove {member.user_name || member.email}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                They will immediately lose access to this organization and its content.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground interaction-button--destructive"
                                onClick={() => void handleRemove(member)}
                                disabled={memberActionId !== null}
                              >
                                Remove member
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <SettingsSectionTitle icon={History}>Recent organization activity</SettingsSectionTitle>
          </CardHeader>
          <CardContent surface="inset">
            {loading ? (
              <div className="h-20 animate-pulse rounded-lg bg-muted/50" />
            ) : detailsLoadError ? null : activity.length === 0 ? (
              <EmptyState
                icon={History}
                kind="inline"
                title="No organization activity yet"
                description="Security-sensitive changes will appear here."
              />
            ) : (
              <div className="divide-y rounded-lg border">
                {visibleActivity.map((item) => {
                  const occurredAt = new Date(item.occurredAt);
                  return (
                    <div key={item.id} className="flex gap-3 p-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                        <History className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{activityDescription(item)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <time
                            dateTime={item.occurredAt}
                            title={occurredAt.toLocaleString(undefined, {
                              dateStyle: 'full',
                              timeStyle: 'short',
                            })}
                          >
                            {occurredAt.toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!loading && activity.length > 3 && (
              <Button
                type="button"
                variant="ghost"
                className="mt-3"
                aria-expanded={activityExpanded}
                onClick={() => setActivityExpanded((expanded) => !expanded)}
              >
                {activityExpanded ? 'Show recent only' : `View all activity (${activity.length})`}
                <ChevronDown
                  className={`ml-2 h-4 w-4 text-blue-600 transition-transform ${activityExpanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Settings2}>Manage organization</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset">
          {!isOwner && (
            <section className="space-y-3" aria-labelledby="leave-organization-title">
              <div className="space-y-1.5">
                <h3 id="leave-organization-title" className="text-sm font-medium">Leave organization</h3>
                <p className="text-sm text-muted-foreground">
                  Leave this organization and its Workspace content.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                    Leave organization
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave {organization.name}?</AlertDialogTitle>
                    <AlertDialogDescription>You will lose access to this organization&apos;s content.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleLifecycle('leave')} disabled={lifecycleAction !== null}>
                      Leave organization
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}
          {isOwner && (
            <section className="space-y-3" aria-labelledby="delete-organization-title">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <h3 id="delete-organization-title" className="text-sm font-medium">Delete organization</h3>
                  <SettingsInfoTooltip label="Organization deletion requirements">
                    Organizations with retained signing evidence cannot be deleted.
                    {organizations.length === 1
                      ? ' Itemize creates a new blank personal organization when one is next needed.'
                      : ''}
                  </SettingsInfoTooltip>
                </div>
                <p className="text-sm text-muted-foreground">
                  Delete this organization and its Workspace data.
                </p>
              </div>
              <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmation(''); }}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Delete organization
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the organization and all of its Workspace data.
                      Organizations containing retained signing evidence cannot be deleted.
                      {organizations.length === 1 ? ' A new blank personal organization will be created when needed.' : ''}
                    </AlertDialogDescription>
                    <div className="grid gap-2 pt-2">
                      <Label htmlFor="delete-organization-confirmation">
                        Type <span className="font-semibold text-foreground">{organization.name}</span> to confirm
                      </Label>
                      <Input
                        id="delete-organization-confirmation"
                        value={deleteConfirmation}
                        autoComplete="off"
                        onChange={(event) => setDeleteConfirmation(event.target.value)}
                      />
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground interaction-button--destructive"
                      onClick={() => void handleLifecycle('delete')}
                      disabled={lifecycleAction !== null || deleteConfirmation !== organization.name}
                    >
                      Delete organization
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
