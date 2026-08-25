import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Globe2,
  Loader2,
  LogOut,
  Plus,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
import { useAuthState } from '@/contexts/AuthContext';
import { useOrganizationContext } from '@/contexts/organization-context';
import { useToast } from '@/hooks/use-toast';
import {
  deleteOrganization,
  getOrganizationMembers,
  inviteMember,
  leaveOrganization,
  removeMember,
  updateMemberRole,
  updateOrganization,
} from '@/services/contactsApi';
import { getBusinesses, type Business } from '@/services/invoicesApi';
import type { JsonRecord, OrganizationMember } from '@/types';

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

export function OrganizationSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuthState();
  const {
    organization,
    organizationId,
    organizations,
    refresh,
  } = useOrganizationContext();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en-US');
  const [defaultBusinessId, setDefaultBusinessId] = useState<number | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessProfilesAvailable, setBusinessProfilesAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberActionId, setMemberActionId] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [lifecycleAction, setLifecycleAction] = useState<'leave' | 'delete' | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const currentRole = organization?.role ?? 'viewer';
  const canManage = currentRole === 'owner' || currentRole === 'admin';
  const isOwner = currentRole === 'owner';
  const currentUserId = Number(currentUser?.uid);

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
    try {
      const [membersResult, businessesResult] = await Promise.allSettled([
        getOrganizationMembers(organizationId),
        getBusinesses(organizationId),
      ]);
      if (membersResult.status === 'rejected') throw membersResult.reason;
      setMembers(membersResult.value);
      if (businessesResult.status === 'fulfilled') {
        setBusinesses(businessesResult.value);
        setBusinessProfilesAvailable(true);
      } else {
        setBusinesses([]);
        setBusinessProfilesAvailable(false);
      }
    } catch (error) {
      toast({
        title: 'Organization unavailable',
        description: error instanceof Error ? error.message : 'Could not load organization details.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const availableTimezones = useMemo(() => {
    return TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];
  }, [timezone]);

  const handleSave = async () => {
    if (!organizationId || !organization || !canManage) return;
    if (!name.trim()) {
      toast({ title: 'Workspace name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!organizationId || !email.trim() || !canManage) return;
    setMemberSaving(true);
    try {
      await inviteMember(organizationId, email.trim(), inviteRole);
      setEmail('');
      await loadDetails();
      toast({ title: 'Member added' });
    } catch (error) {
      toast({
        title: 'Could not add member',
        description: error instanceof Error ? error.message : 'The user must already have an Itemize account.',
        variant: 'destructive',
      });
    } finally {
      setMemberSaving(false);
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

  const handleLifecycle = async (action: 'leave' | 'delete') => {
    if (!organizationId) return;
    setLifecycleAction(action);
    try {
      if (action === 'delete') await deleteOrganization(organizationId);
      else await leaveOrganization(organizationId);
      await refresh();
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
      <div className="hidden lg:block">
        <h3 className="text-lg font-medium">Organization</h3>
        <p className="text-sm text-muted-foreground">Manage this workspace and its members</p>
      </div>
      <Separator className="hidden lg:block" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-blue-600" />
            Workspace identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="organization-name">Workspace name</Label>
            <Input
              id="organization-name"
              value={name}
              maxLength={255}
              disabled={!canManage || saving}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Used inside Itemize. Customer-facing documents use the business identity below.
            </p>
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
            <Label id="default-business-label" htmlFor="default-business">Default business identity</Label>
            {businessProfilesAvailable && businesses.length > 0 ? (
              <Select
                value={defaultBusinessId?.toString() ?? 'workspace'}
                onValueChange={(value) => setDefaultBusinessId(value === 'workspace' ? null : Number(value))}
                disabled={!canManage || saving}
              >
                <SelectTrigger id="default-business" aria-label="Default business identity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">Use workspace name</SelectItem>
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
            <p className="text-sm text-muted-foreground">
              Used automatically for new estimates and as the first choice for new invoices.
            </p>
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-blue-600" />
            Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <Input
                type="email"
                value={email}
                placeholder="teammate@example.com"
                aria-label="Member email"
                onChange={(event) => setEmail(event.target.value)}
              />
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as typeof inviteRole)}>
                <SelectTrigger aria-label="Member role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => void handleAddMember()} disabled={memberSaving || !email.trim()}>
                {memberSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add member
              </Button>
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
                return (
                  <div key={member.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-blue-600 text-sm text-white">{initials(member)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.user_name || member.email || 'Member'}</p>
                      {member.user_name && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
                    </div>
                    <div className="flex items-center gap-2">
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
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${member.email}`}
                          disabled={memberActionId === member.id}
                          onClick={() => void handleRemove(member)}
                        >
                          {memberActionId === member.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {canManage && (
            <p className="text-sm text-muted-foreground">
              Members must already have an Itemize account. Email invitations can follow after launch.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="h-4 w-4 text-blue-600" />
            Organization access
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          {!isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline"><LogOut className="mr-2 h-4 w-4" />Leave organization</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave {organization.name}?</AlertDialogTitle>
                  <AlertDialogDescription>You will lose access to this organization’s content.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleLifecycle('leave')} disabled={lifecycleAction !== null}>
                    Leave organization
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isOwner && (
            <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmation(''); }}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />Delete organization
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes its workspace data. Organizations containing retained signature evidence cannot be deleted.
                    {organizations.length === 1 ? ' A new blank personal workspace will be created when needed.' : ''}
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
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleLifecycle('delete')}
                    disabled={lifecycleAction !== null || deleteConfirmation !== organization.name}
                  >
                    Delete organization
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
