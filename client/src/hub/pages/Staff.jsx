import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ActivityLogPanel } from '@/hub/components/ActivityLogPanel';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Checkbox } from '@/hub/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/hub/ui/tabs';
import {
  accessQuery,

  createStaffAccount,
  inviteStaff,
  permissionCatalogueQuery,
  qk,
  resetStaffPassword,
  sendPasswordReset,
  setStaffPermissions,
  setStaffRole,
  setStaffStatus,
  staffQuery,
} from '@/hub/lib/api';
import { can } from '@/hub/lib/permissions';
import { generateTemporaryPassword, normalizeUsername, usernameProblem } from '@/hub/lib/username';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const STAFF_STATUS_LABELS = {
  pending: 'Pending Approval',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

const dt = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Permission groups, presets and preset names from the server's catalogue. */
function useCatalogue() {
  const catalogue = useQuery(permissionCatalogueQuery).data;
  return useMemo(() => {
    const groups = catalogue?.groups ?? [];
    return {
      groups,
      presets: catalogue?.presets ?? {},
      presetNames: catalogue?.presetNames ?? ['Custom'],
      all: groups.flatMap((g) => g.items.map((i) => i.key)),
    };
  }, [catalogue]);
}

export default function StaffPage() {
  useHubTitle('Staff & Permissions — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const canManage = can(access, 'admin.manage_staff');
  const canAudit = can(access, 'admin.view_audit');
  const staff = useQuery({ ...staffQuery, enabled: canManage });
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'activity' || !canManage ? 'activity' : 'staff';
  const setTab = (next) => setParams(next === 'activity' ? { tab: 'activity' } : {}, { replace: true });
  const [editing, setEditing] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetting, setResetting] = useState(null);

  // The activity log lives here; someone with only "View audit logs" gets just the log.
  if (!canManage && canAudit) {
    return (
      <>
        <PageHeader title="Activity Log" subtitle="Who did what, across the hub, the till and the classic admin." />
        <ActivityLogPanel />
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        <PageHeader title="Staff & Permissions" subtitle="Restricted area" />
        <EmptyState
          title="You do not have permission to view this page"
          hint="Ask an Admin if you need staff management access."
        />
      </>
    );
  }

  const activeAdmins = (staff.data ?? []).filter((s) => s.role === 'admin' && s.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Staff & Permissions"
        subtitle={`${staff.data?.length ?? 0} staff accounts · ${activeAdmins} active Admin${activeAdmins === 1 ? '' : 's'}`}
        onRefresh={() => void staff.refetch()}
        refreshing={staff.isFetching}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="staff">Staff accounts</TabsTrigger>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <div className="no-print mb-4 flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-2 size-4" /> Create staff account
            </Button>
            {can(access, 'admin.invite_staff') && (
              <Button variant="outline" className="h-11" onClick={() => setInviteOpen(true)}>
                Invite by email
              </Button>
            )}
          </div>

          {staff.isPending ? (
            <LoadingRows count={5} />
          ) : staff.isError ? (
            <ErrorState section="Staff" message={staff.error.message} onRetry={() => void staff.refetch()} />
          ) : !staff.data?.length ? (
            <EmptyState title="No staff accounts yet" />
          ) : (
            <ul className="grid gap-3">
              {staff.data.map((member) => (
                <li key={member.id} className="card-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.fullName ?? member.email ?? member.id}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.username ? `@${member.username}` : null}
                        {member.username && member.email ? ' · ' : null}
                        {member.email ?? (member.username ? null : '—')}
                      </p>
                      {member.mustChangePassword && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Temporary password — must be changed at next sign-in
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                          {member.role === 'admin' ? <ShieldCheck className="size-3" /> : null}
                          {member.role === 'admin' ? 'Admin' : member.role === 'delivery' ? 'Delivery staff' : 'Staff'}
                        </span>
                        <StatusPill status={member.status} />
                        <span className="text-muted-foreground">
                          {member.role === 'admin' ? 'Full access' : `${member.permissions.length} permissions`}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last login {dt(member.lastLoginAt)}
                        {member.approvedByName ? ` · Approved by ${member.approvedByName} ${dt(member.approvedAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.status === 'pending' && <StatusButton member={member} next="active" label="Approve" />}
                      {member.status === 'active' && (
                        <StatusButton member={member} next="suspended" label="Suspend" variant="outline" />
                      )}
                      {(member.status === 'suspended' || member.status === 'deactivated') && (
                        <StatusButton member={member} next="active" label="Reactivate" variant="outline" />
                      )}
                      {member.status !== 'deactivated' && member.status !== 'pending' && (
                        <StatusButton member={member} next="deactivated" label="Deactivate" variant="outline" />
                      )}
                      {can(access, 'admin.change_permissions') && (
                        <Button variant="outline" className="h-10" onClick={() => setEditing(member)}>
                          Permissions
                        </Button>
                      )}
                      <Button variant="outline" className="h-10" onClick={() => setResetting(member)}>
                        <KeyRound className="mr-2 size-4" /> Reset password
                      </Button>
                      {member.email && <SendResetButton email={member.email} />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity">
          {can(access, 'admin.view_audit') ? (
            <ActivityLogPanel />
          ) : (
            <EmptyState title="You do not have permission to view the activity log" />
          )}
        </TabsContent>
      </Tabs>

      <PermissionsDialog member={editing} onClose={() => setEditing(null)} />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CreateStaffDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} />
    </>
  );
}

/**
 * Sends the staff member a secure reset link. Admins can never see or set a
 * password themselves — the user chooses their own via the emailed link.
 */
function SendResetButton({ email }) {
  const mutation = useMutation({
    mutationFn: () => sendPasswordReset(email),
    onSuccess: () => toast.success(`Password reset link sent to ${email}`),
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button variant="outline" className="h-10" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
      Send reset link
    </Button>
  );
}

function StatusPill({ status }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'pending'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {STAFF_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatusButton({ member, next, label, variant = 'default' }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => setStaffStatus(member, next),
    onSuccess: async () => {
      toast.success(`${member.email ?? member.fullName ?? 'Account'} — ${STAFF_STATUS_LABELS[next]}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.staff }),
        client.invalidateQueries({ queryKey: qk.activity }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button variant={variant} className="h-10" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
      {label}
    </Button>
  );
}

function PermissionsDialog({ member, onClose }) {
  return (
    <Dialog open={Boolean(member)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        {/* Keyed so the form starts from this member's saved role and permissions. */}
        {member && <PermissionsForm key={member.id} member={member} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PermissionsForm({ member, onClose }) {
  const client = useQueryClient();
  const { groups, presets, presetNames, all } = useCatalogue();
  const [role, setRole] = useState(member.role);
  const [selected, setSelected] = useState(member.permissions);
  const [pickedPreset, setPickedPreset] = useState(null);

  // Until the user picks one, show the preset that matches the saved permissions.
  const matchedPreset =
    presetNames.find(
      (name) =>
        name !== 'Custom' &&
        (presets[name] ?? []).length === member.permissions.length &&
        (presets[name] ?? []).every((p) => member.permissions.includes(p)),
    ) ?? 'Custom';
  const preset = pickedPreset ?? matchedPreset;

  const dirty = useMemo(() => {
    if (role !== member.role) return true;
    if (selected.length !== member.permissions.length) return true;
    return selected.some((p) => !member.permissions.includes(p));
  }, [member, role, selected]);

  const save = useMutation({
    mutationFn: async () => {
      if (role !== member.role) await setStaffRole(member, role);
      await setStaffPermissions(member, selected);
    },
    onSuccess: async () => {
      toast.success('Permissions updated');
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.staff }),
        client.invalidateQueries({ queryKey: qk.activity }),
        client.invalidateQueries({ queryKey: qk.access }),
      ]);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const applyPreset = (name) => {
    setPickedPreset(name);
    if (name === 'Custom') return;
    setSelected(presets[name] ?? []);
  };

  const toggle = (key, on) => {
    setPickedPreset('Custom');
    setSelected((prev) => (on ? [...new Set([...prev, key])] : prev.filter((p) => p !== key)));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{member.fullName ?? member.email ?? 'Staff member'}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="delivery">Delivery staff</SelectItem>
                <SelectItem value="admin">Admin (full access)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Preset</Label>
            <Select value={preset} onValueChange={applyPreset}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {role === 'admin' ? (
          <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-muted-foreground">
            Admins always have full access to every module, so individual permissions do not apply.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-9"
                onClick={() => {
                  setPickedPreset('Custom');
                  setSelected([...all]);
                }}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => {
                  setPickedPreset('Custom');
                  setSelected([]);
                }}
              >
                Clear all
              </Button>
            </div>
            {groups.map((group) => (
              <section key={group.group} className="rounded-2xl border border-border p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">{group.group}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((permission) => (
                    <li key={permission.key} className="flex items-start gap-2">
                      <Checkbox
                        id={permission.key}
                        checked={selected.includes(permission.key)}
                        onCheckedChange={(value) => toggle(permission.key, value === true)}
                      />
                      <Label htmlFor={permission.key} className="text-sm font-normal leading-tight text-foreground">
                        {permission.label}
                        {permission.hint && <span className="block text-xs text-muted-foreground">{permission.hint}</span>}
                      </Label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

function PresetSelect({ value, onChange }) {
  const { presetNames } = useCatalogue();
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Permission preset</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presetNames
            .filter((name) => name !== 'Custom')
            .map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InviteDialog({ open, onClose }) {
  const client = useQueryClient();
  const { presets } = useCatalogue();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('staff');
  const [preset, setPreset] = useState('Sales Staff');

  const invite = useMutation({
    mutationFn: () =>
      inviteStaff({
        email: email.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        role,
        permissions: role === 'admin' ? [] : presets[preset] ?? [],
      }),
    onSuccess: async () => {
      toast.success('Invitation sent — the staff member sets their own password.');
      await client.invalidateQueries({ queryKey: qk.staff });
      setEmail('');
      setFullName('');
      setPhone('');
      onClose();
    },
    onError: (error) =>
      toast.error(
        `${error.message} — alternatively, ask them to sign up with this email; they will appear here as Pending Approval.`,
      ),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Full name</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-11" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11"
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-11" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="delivery">Delivery staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role !== 'admin' && <PresetSelect value={preset} onChange={setPreset} />}
          </div>
          <p className="text-xs text-muted-foreground">
            No password is ever created or shared. The invitee sets their own password and stays Pending Approval until
            an Admin approves the account.
          </p>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="h-11"
              disabled={!email.trim() || !fullName.trim() || invite.isPending}
              onClick={() => invite.mutate()}
            >
              {invite.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send invitation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a temporary password once, for the Admin to share manually. */
function TemporaryPasswordNotice({ password }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Temporary password</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-background px-2 py-1.5 text-sm font-semibold">{password}</code>
        <Button
          variant="outline"
          className="h-9"
          onClick={() => {
            void navigator.clipboard?.writeText(password);
            toast.success('Copied');
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Shown once only. Share it directly with the staff member — they must set their own password before they can use
        the Hub.
      </p>
    </div>
  );
}

function PasswordInput({ value, onChange }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Temporary password</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
          autoComplete="off"
          placeholder="Leave blank to generate one"
        />
        <Button variant="outline" className="h-11" onClick={() => onChange(generateTemporaryPassword())}>
          Generate
        </Button>
      </div>
    </div>
  );
}

/**
 * Creates a staff account that signs in with a username. Email and phone are
 * optional; the password is only ever shown here, never stored by the app.
 */
function CreateStaffDialog({ open, onClose }) {
  const client = useQueryClient();
  const { presets } = useCatalogue();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('staff');
  const [preset, setPreset] = useState('Sales Staff');
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setPhone('');
    setRole('staff');
    setPreset('Sales Staff');
    setPassword('');
    setIssued(null);
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      createStaffAccount({
        fullName: fullName.trim(),
        username: normalizeUsername(username),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
        permissions: role === 'admin' ? [] : presets[preset] ?? [],
        password: password.trim() || null,
      }),
    onSuccess: async (result) => {
      setIssued({ username: result.username, password: result.temporaryPassword });
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.staff }),
        client.invalidateQueries({ queryKey: qk.activity }),
      ]);
    },
    onError: (err) => setError(err.message),
  });

  const submit = () => {
    setError(null);
    const nameProblem = usernameProblem(username);
    if (nameProblem) return setError(nameProblem);
    if (fullName.trim().length < 2) return setError("Enter the staff member's full name.");
    create.mutate();
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Create staff account</DialogTitle>
        </DialogHeader>

        {issued ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Account created. The staff member signs in with the username{' '}
              <span className="font-semibold">{issued.username}</span> and this password.
            </p>
            <TemporaryPasswordNotice password={issued.password} />
            <div className="flex justify-end border-t border-border pt-4">
              <Button className="h-11" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11"
                autoComplete="off"
                placeholder="e.g. sumayya"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Email (optional)
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Phone (optional)
                </Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="delivery">Delivery staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role !== 'admin' && <PresetSelect value={preset} onChange={setPreset} />}
            </div>
            <PasswordInput value={password} onChange={setPassword} />
            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The staff member must change this password before they can use the Hub. Passwords are never stored in
              staff records, audit logs or exports.
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" className="h-11" onClick={close}>
                Cancel
              </Button>
              <Button className="h-11" disabled={create.isPending} onClick={submit}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create account
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Issues a new temporary password — works for accounts without an email. */
function ResetPasswordDialog({ member, onClose }) {
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);

  const close = () => {
    setPassword('');
    setIssued(null);
    setError(null);
    onClose();
  };

  const reset = useMutation({
    mutationFn: () => resetStaffPassword(member?.id ?? '', password.trim() || null),
    onSuccess: async (result) => {
      setIssued(result.temporaryPassword);
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.staff }),
        client.invalidateQueries({ queryKey: qk.activity }),
      ]);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Dialog open={Boolean(member)} onOpenChange={(next) => !next && close()}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Reset staff password</DialogTitle>
        </DialogHeader>
        {issued ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              New temporary password for{' '}
              <span className="font-semibold">{member?.fullName ?? member?.username ?? member?.email}</span>.
            </p>
            <TemporaryPasswordNotice password={issued} />
            <div className="flex justify-end border-t border-border pt-4">
              <Button className="h-11" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Existing passwords can never be viewed. This replaces the password and requires the staff member to choose
              a new one at next sign-in.
            </p>
            <PasswordInput value={password} onChange={setPassword} />
            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" className="h-11" onClick={close}>
                Cancel
              </Button>
              <Button className="h-11" disabled={reset.isPending} onClick={() => reset.mutate()}>
                {reset.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Reset password
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
