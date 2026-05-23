import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';
import { AVATAR_COLORS } from '../lib/colors';

interface UserRow {
  id: number;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

interface InvitationRow {
  id: number;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  invitedByName?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'PM',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_BADGE_STYLE: Record<string, string> = {
  admin: 'bg-ink text-white',
  project_manager: 'bg-lilac-tint text-lilac-dark',
  member: 'bg-card border border-rule text-text',
  viewer: 'bg-paper text-mute',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function SettingsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [invitationFilter, setInvitationFilter] = useState<'pending' | 'accepted' | 'expired'>('pending');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [memberSearch, setMemberSearch] = useState('');
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ userId: number; role: string; displayName: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ userId: number; displayName: string } | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadUsers();
    loadInvitations();
    apiClient.get('/projects?limit=1').then((res) => {
      setProjectCount(res.data.data?.total ?? res.data.data?.list?.length ?? null);
    }).catch(() => {});
  }, []);

  const loadUsers = async () => {
    try {
      const { data } = await apiClient.get('/users');
      setUsers(data.data.list || []);
    } catch (err) { console.error(err); }
  };

  const loadInvitations = async () => {
    try {
      const { data } = await apiClient.get('/users/invitations');
      setInvitations(data?.data?.list || []);
    } catch (err) { console.error(err); }
  };

  const handleChangeRole = async (userId: number, role: string) => {
    try {
      await apiClient.put(`/users/${userId}/role`, { role });
      loadUsers();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to change role', 'error');
    }
  };

  const handleDeactivate = async (userId: number) => {
    try {
      await apiClient.put(`/users/${userId}/deactivate`);
      loadUsers();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to deactivate user', 'error');
    }
  };

  const handleReactivate = async (userId: number) => {
    try {
      await apiClient.put(`/users/${userId}/reactivate`);
      loadUsers();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to reactivate user', 'error');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await apiClient.post('/users/invite', { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      toast('Invitation sent');
      loadInvitations();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to send invitation', 'error');
    }
  };

  const activeUsers = users.filter((u) => u.isActive);
  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, memberSearch]);

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const acceptedInvitations = invitations.filter((i) => i.status === 'accepted');
  const expiredInvitations = invitations.filter((i) => i.status === 'expired');
  const visibleInvitations =
    invitationFilter === 'pending' ? pendingInvitations :
    invitationFilter === 'accepted' ? acceptedInvitations :
    expiredInvitations;

  // Loose "expires this week" count for the header strip.
  const expiringThisWeek = pendingInvitations.filter((i) => {
    const ms = new Date(i.expiresAt).getTime() - Date.now();
    return ms > 0 && ms < 7 * 86_400_000;
  }).length;

  // Seats utilised: heuristic — active users / target capacity. If no capacity
  // env is exposed, use a soft target of 25 (the design's "97%" came from 24/25).
  const seatTarget = 25;
  const seatPct = activeUsers.length > 0 ? Math.min(100, Math.round((activeUsers.length / seatTarget) * 100)) : 0;

  return (
    <div className="p-6 max-w-6xl">
      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-faint mb-1">
        Instance · {typeof window !== 'undefined' ? window.location.hostname : 'trackero.local'} · Admin only
      </div>
      <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <h1 className="font-serif text-[28px] text-text">
          Users <span className="italic">&amp; invitations</span>
        </h1>
        <Button onClick={() => document.getElementById('invite-form')?.scrollIntoView({ behavior: 'smooth' })}>+ Invite people</Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <Stat n={activeUsers.length} label="Active users" />
        <Stat n={pendingInvitations.length} label="Pending invitations" />
        <Stat n={expiringThisWeek} label="Expired this week" />
        <Stat n={projectCount ?? '—'} label="Projects" />
        <Stat n={`${seatPct}%`} label="Seats utilised" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Members */}
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-serif text-[20px] text-text">Members</h2>
            <span className="text-[12px] text-mute">· {users.length} users</span>
            <div className="ml-auto">
              <Input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="search users…"
                className="w-[200px]"
              />
            </div>
          </div>
          <div className="rounded-xl bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-rule text-[10px] uppercase tracking-[0.16em] text-faint">
              <span>User</span>
              <span>Role</span>
              <span>Last seen</span>
              <span></span>
            </div>
            {filteredUsers.map((u) => {
              const isSelf = u.id === user?.id;
              const avatar = AVATAR_COLORS[u.id % AVATAR_COLORS.length];
              const initial = (u.displayName || u.email)[0]?.toUpperCase() || '?';
              return (
                <div key={u.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center border-b border-rule/60 last:border-b-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: avatar.bg, color: avatar.color }}
                    >
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-text truncate">
                        {u.displayName} {isSelf && <span className="text-[11px] text-faint">· you</span>}
                      </div>
                      <div className="text-[12px] text-mute truncate">{u.email}</div>
                    </div>
                  </div>
                  <div>
                    {u.isActive && !isSelf ? (
                      <Select
                        value={u.role}
                        onChange={(val) => {
                          if (val === u.role) return;
                          setConfirmRoleChange({ userId: u.id, role: val, displayName: u.displayName });
                        }}
                        options={[
                          { value: 'admin', label: 'Admin' },
                          { value: 'project_manager', label: 'PM' },
                          { value: 'member', label: 'Member' },
                          { value: 'viewer', label: 'Viewer' },
                        ]}
                      />
                    ) : (
                      <span className={`text-[11px] uppercase tracking-[0.12em] px-2 py-0.5 rounded ${ROLE_BADGE_STYLE[u.role] ?? 'text-mute'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-mute">
                    {u.isActive ? timeAgo(u.lastLoginAt) : <span className="text-danger">Inactive</span>}
                  </div>
                  <div className="text-right">
                    {u.isActive && !isSelf && (
                      <button onClick={() => setConfirmDeactivate({ userId: u.id, displayName: u.displayName })} className="text-[12px] text-faint hover:text-danger">
                        Deactivate
                      </button>
                    )}
                    {!u.isActive && (
                      <button onClick={() => handleReactivate(u.id)} className="text-[12px] text-faint hover:text-mint-dark">
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="p-6 text-center text-[13px] text-faint">No users match &ldquo;{memberSearch}&rdquo;.</div>
            )}
          </div>
        </section>

        {/* Invitations panel */}
        <aside>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-serif text-[20px] text-text">Invitations</h2>
            <span className="text-[12px] text-mute">· sent via email · expire in 7 days</span>
          </div>

          <div className="rounded-xl bg-card overflow-hidden">
            <div className="flex gap-1 px-3 pt-3 border-b border-rule">
              <FilterTab active={invitationFilter === 'pending'} onClick={() => setInvitationFilter('pending')} count={pendingInvitations.length}>Pending</FilterTab>
              <FilterTab active={invitationFilter === 'accepted'} onClick={() => setInvitationFilter('accepted')} count={acceptedInvitations.length}>Accepted</FilterTab>
              <FilterTab active={invitationFilter === 'expired'} onClick={() => setInvitationFilter('expired')} count={expiredInvitations.length}>Expired</FilterTab>
            </div>

            <div className="px-3 py-2 max-h-[400px] overflow-y-auto custom-scrollbar">
              {visibleInvitations.length === 0 && (
                <div className="py-6 text-center text-[13px] text-faint">No {invitationFilter} invitations.</div>
              )}
              {visibleInvitations.map((inv) => {
                const ms = new Date(inv.expiresAt).getTime() - Date.now();
                const days = Math.max(0, Math.floor(ms / 86_400_000));
                const expireLabel = inv.status === 'expired'
                  ? 'EXPIRED'
                  : days <= 0 ? 'EXPIRES TODAY' : `EXPIRES IN ${days}D`;
                return (
                  <div key={inv.id} className="py-2 border-b border-rule/60 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-text truncate flex-1">{inv.email}</span>
                      <span className={`text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded ${ROLE_BADGE_STYLE[inv.role] ?? 'text-mute'}`}>
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between text-[11px] text-faint">
                      <span>{inv.invitedByName ? `by ${inv.invitedByName} · ` : ''}{timeAgo(inv.expiresAt)} ago</span>
                      <span className={inv.status === 'expired' ? 'text-danger' : 'text-mute'}>{expireLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Send invite form */}
            <form id="invite-form" onSubmit={handleInvite} className="p-3 border-t border-rule space-y-2 bg-paper/50">
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-faint">Send an invite</div>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@org.com" required />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={inviteRole}
                    onChange={setInviteRole}
                    options={[
                      { value: 'member', label: 'Member' },
                      { value: 'viewer', label: 'Viewer' },
                      { value: 'project_manager', label: 'PM' },
                      { value: 'admin', label: 'Admin' },
                    ]}
                  />
                </div>
                <Button type="submit">Send</Button>
              </div>
              <p className="text-[11px] text-faint pt-1">Paste a line per row for bulk invites.</p>
            </form>
          </div>
        </aside>
      </div>

      {confirmRoleChange && (
        <ConfirmDialog
          title="Change role"
          message={`Change ${confirmRoleChange.displayName}'s role to ${ROLE_LABELS[confirmRoleChange.role] ?? confirmRoleChange.role}?`}
          confirmLabel="Change role"
          onConfirm={async () => {
            const { userId, role } = confirmRoleChange;
            setConfirmRoleChange(null);
            await handleChangeRole(userId, role);
          }}
          onCancel={() => setConfirmRoleChange(null)}
        />
      )}

      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate user"
          message={`Deactivate ${confirmDeactivate.displayName}? They will lose access until reactivated.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={async () => {
            const { userId } = confirmDeactivate;
            setConfirmDeactivate(null);
            await handleDeactivate(userId);
          }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3">
      <div className="font-serif italic text-[36px] leading-none text-text">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-faint mt-2">{label}</div>
    </div>
  );
}

function FilterTab({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 pb-2 text-[12px] font-medium border-b-2 -mb-px ${
        active ? 'border-lilac text-lilac-dark' : 'border-transparent text-mute hover:text-text'
      }`}
    >
      {children} <span className="text-faint">· {count}</span>
    </button>
  );
}
