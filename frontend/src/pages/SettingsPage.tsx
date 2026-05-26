import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, Lock, Inbox } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';
import { AVATAR_COLORS } from '../lib/colors';
import { EllipsisDots } from '../components/icons';

interface UserRow {
  id: number;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  projectCount: number;
}

interface InvitationRow {
  id: number;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedByName?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'PM',
  member: 'Member',
  viewer: 'Viewer',
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
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

function timeSince(iso: string): string {
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function SettingsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [invitationFilter, setInvitationFilter] = useState<'pending' | 'accepted' | 'expired' | 'invite'>('pending');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
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

  const expiringThisWeek = pendingInvitations.filter((i) => {
    const ms = new Date(i.expiresAt).getTime() - Date.now();
    return ms > 0 && ms < 7 * 86_400_000;
  }).length;

  const seatTarget = 25;
  const seatPct = activeUsers.length > 0 ? Math.min(100, Math.round((activeUsers.length / seatTarget) * 100)) : 0;

  return (
    <div className="p-6">
      <div>
        <div className="smallcaps text-faint mb-0.5">
          Instance · {typeof window !== 'undefined' ? window.location.hostname : 'trackero.local'} · admin only
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-serif text-[36px] text-text">
            Users <span className="serif-i">&amp; invitations</span>
          </h1>
          <Button onClick={() => setInvitationFilter('invite')}>
            <Plus size={12} className="mr-1.5 inline" />
            Invite people
          </Button>
        </div>
      </div>

      {/* Stat strip — full-bleed borders (no horizontal padding on the border) */}
      <div className="flex border-t border-b border-rule">
        <StatCell n={activeUsers.length} label="active users" />
        <StatCell n={pendingInvitations.length} label="pending invitations" />
        <StatCell n={expiringThisWeek} label="expired this week" accent />
        <StatCell n={projectCount ?? '—'} label="projects" />
        <StatCell n={`${seatPct} %`} label="seats utilised" last />
      </div>

      {/* Two-column: members left, invitations right — fills remaining viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 h-[calc(100vh-218px)] overflow-hidden">

        {/* ── Members ── */}
        <section className="flex flex-col border-r border-rule min-h-0">
          <div className="flex items-baseline gap-3 px-6 pt-4 pb-3">
            <h2 className="font-serif text-[20px] text-text">Members</h2>
            <span className="text-[12px] font-mono text-mute">· {users.length} users</span>
            <div className="flex-1" />
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="search users…"
                className="pl-8 pr-3 py-1.5 text-[13px] bg-transparent border border-rule rounded-[var(--radius)] w-[200px] outline-none focus:border-lilac text-text placeholder:text-faint"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_100px_80px_28px] gap-2 px-4 py-2 border-b border-rule">
            <span className="smallcaps text-faint">User</span>
            <span className="smallcaps text-faint">Role</span>
            <span className="smallcaps text-faint">Projects</span>
            <span className="smallcaps text-faint">Last seen</span>
            <span />
          </div>

          {/* Table body — fills remaining height, scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredUsers.map((u) => {
              const isSelf = u.id === user?.id;
              const avatar = AVATAR_COLORS[u.id % AVATAR_COLORS.length];
              const emailPrefix = u.email.split('@')[0];
              const isSelected = u.id === selectedUserId;

              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`grid grid-cols-[1fr_100px_100px_80px_28px] gap-2 py-3 items-center border-b border-rule/40 last:border-b-0 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-lilac-tint/50 border-l-[3px] border-l-lilac pl-[13px] pr-4'
                      : 'hover:bg-[var(--paper-2)]/60 px-4'
                  }`}
                >
                  {/* User */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 uppercase"
                      style={{ backgroundColor: avatar.bg, color: avatar.color }}
                    >
                      {(u.displayName || '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-text truncate">{u.displayName}</div>
                      <div className="text-[11px] font-mono text-mute truncate">@{emailPrefix} · {u.email}</div>
                    </div>
                  </div>

                  {/* Role */}
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
                      <RoleBadge role={u.role} />
                    )}
                  </div>

                  {/* Projects */}
                  <div className="text-[12px] font-mono text-mute tabular-nums">
                    {u.projectCount} project{u.projectCount !== 1 ? 's' : ''}
                  </div>

                  {/* Last seen */}
                  <div className="text-[12px] font-mono text-mute tabular-nums">
                    {u.isActive ? timeAgo(u.lastLoginAt) : <span className="text-danger">Inactive</span>}
                  </div>

                  {/* Actions */}
                  <RowMenu
                    isSelf={isSelf}
                    isActive={u.isActive}
                    onDeactivate={() => setConfirmDeactivate({ userId: u.id, displayName: u.displayName })}
                    onReactivate={() => handleReactivate(u.id)}
                  />
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="p-6 text-center text-[13px] text-faint">No users match &ldquo;{memberSearch}&rdquo;.</div>
            )}
          </div>
        </section>

        {/* ── Invitations panel ── */}
        <aside className="flex flex-col bg-[var(--paper-2)] min-h-0">
          <div className="pt-4 px-5">
            <h2 className="font-serif text-[20px] text-text mb-0.5">Invitations</h2>
            <div className="text-[12px] text-mute mb-3">Sent via email · expire in 7 days.</div>

            {/* Filter tabs — pill style, "Send invite" as last tab */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              <FilterTab active={invitationFilter === 'pending'} onClick={() => setInvitationFilter('pending')} count={pendingInvitations.length}>Pending</FilterTab>
              <FilterTab active={invitationFilter === 'accepted'} onClick={() => setInvitationFilter('accepted')} count={acceptedInvitations.length}>Accepted</FilterTab>
              <FilterTab active={invitationFilter === 'expired'} onClick={() => setInvitationFilter('expired')} count={expiredInvitations.length}>Expired</FilterTab>
              <button
                onClick={() => setInvitationFilter('invite')}
                className={`px-3 py-1 text-[12px] font-medium rounded-full border transition-colors ${
                  invitationFilter === 'invite'
                    ? 'bg-ink text-white border-ink'
                    : 'bg-transparent text-mute border-rule hover:text-text hover:border-text'
                }`}
              >
                + Send invite
              </button>
            </div>
          </div>

          {/* Content area — fills remaining height, scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5">
            {invitationFilter === 'invite' ? (
              <form id="invite-form" onSubmit={handleInvite} className="space-y-3">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@org.com" required />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={inviteRole}
                      onChange={setInviteRole}
                      options={[
                        { value: 'admin', label: 'Admin' },
                        { value: 'project_manager', label: 'PM' },
                        { value: 'member', label: 'Member' },
                        { value: 'viewer', label: 'Viewer' },
                      ]}
                    />
                  </div>
                  <Button type="submit">Send</Button>
                </div>
                <p className="text-[11px] text-faint">Paste a line per row for bulk invites.</p>
              </form>
            ) : (
              <>
                {visibleInvitations.length === 0 && (
                  <div className="py-6 text-center text-[13px] text-faint">No {invitationFilter} invitations.</div>
                )}
                {visibleInvitations.map((inv) => {
                  const ms = new Date(inv.expiresAt).getTime() - Date.now();
                  const days = Math.max(0, Math.floor(ms / 86_400_000));
                  const isExpiring = inv.status === 'expired' || days <= 0;
                  const expireLabel = inv.status === 'expired'
                    ? 'EXPIRED'
                    : days <= 0 ? 'EXPIRES TODAY!' : `EXPIRES IN ${days}D`;

                  return (
                    <div
                      key={inv.id}
                      className={`py-3 border-b border-rule/30 last:border-b-0 ${
                        isExpiring ? 'bg-danger/5 border border-danger/20 rounded-[var(--radius)] px-3 my-1' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Inbox size={13} className="text-mute flex-shrink-0" />
                        <span className="text-[13px] font-mono text-text truncate flex-1">{inv.email}</span>
                        <RoleBadge role={inv.role} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint ml-[21px]">
                        {inv.invitedByName && (
                          <>
                            <span className="w-5 h-5 rounded-full bg-lilac-tint text-lilac-dark text-[9px] font-bold flex items-center justify-center flex-shrink-0 uppercase">
                              {inv.invitedByName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                            </span>
                            <span>by {inv.invitedByName.split(' ')[0]} · {timeSince(inv.createdAt)}</span>
                          </>
                        )}
                        <div className="flex-1" />
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${isExpiring ? 'text-danger font-semibold' : 'text-mute'}`}>
                          {isExpiring && '⚠ '}{expireLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
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

function StatCell({ n, label, accent, last }: { n: number | string; label: string; accent?: boolean; last?: boolean }) {
  return (
    <div className={`flex-1 py-5 px-6 ${!last ? 'border-r border-rule' : ''}`}>
      <div className={`font-serif text-[38px] leading-none ${accent ? 'text-[var(--accent)]' : 'text-text'}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-faint mt-2">{label}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'bg-ink text-white',
    project_manager: 'bg-[var(--accent)] text-white',
    member: 'bg-transparent border border-rule text-text',
    viewer: 'bg-transparent border border-rule text-mute',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-[var(--radius)] ${styles[role] ?? 'text-mute border border-rule'}`}>
      {role === 'admin' && (
        <Lock size={9} />
      )}
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function FilterTab({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[12px] font-medium rounded-full border transition-colors ${
        active
          ? 'bg-ink text-white border-ink'
          : 'bg-transparent text-mute border-rule hover:text-text hover:border-text'
      }`}
    >
      {children} · {count}
    </button>
  );
}

function RowMenu({ isSelf, isActive, onDeactivate, onReactivate }: {
  isSelf: boolean;
  isActive: boolean;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (isSelf) return <div />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper text-faint hover:text-text"
      >
        <EllipsisDots />
      </button>
      {open && (
        <div className="dropdown-panel absolute right-0 mt-1 w-36 bg-card z-50 py-1">
          {isActive && (
            <button
              onClick={() => { setOpen(false); onDeactivate(); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10"
            >
              Deactivate
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => { setOpen(false); onReactivate(); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-text hover:bg-paper"
            >
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
