import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../components/common/Toast';

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
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'PM',
  member: 'Member',
  viewer: 'Viewer',
};

export function SettingsPage() {
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ userId: number; role: string; displayName: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ userId: number; displayName: string } | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadUsers();
    loadInvitations();
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
      loadInvitations();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to send invitation', 'error');
    }
  };

  const tabs = [
    { key: 'members', label: 'Members' },
    { key: 'invitations', label: 'Invitations' },
  ] as const;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700 mb-4">Settings</h1>

      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-dneutral-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[16px] font-medium border-b-2 -mb-px ${tab === t.key ? 'border-peri text-peri' : 'border-transparent text-neutral-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-[16px]">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-dneutral-200">
                  <th className="text-left py-2 px-3 text-neutral-400 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-neutral-400 font-medium">Email</th>
                  <th className="text-left py-2 px-3 text-neutral-400 font-medium">Role</th>
                  <th className="text-left py-2 px-3 text-neutral-400 font-medium">Status</th>
                  <th className="text-left py-2 px-3 text-neutral-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-b border-neutral-100 dark:border-dneutral-200">
                      <td className="py-2 px-3 text-neutral-700 dark:text-dneutral-700">{u.displayName}</td>
                      <td className="py-2 px-3 text-neutral-500 dark:text-dneutral-500">{u.email}</td>
                      <td className="py-2 px-3">
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
                          <span className="text-[16px] text-neutral-400 dark:text-dneutral-400">{ROLE_LABELS[u.role] ?? u.role}</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-[16px] px-2 py-0.5 rounded ${u.isActive ? 'bg-mint-light dark:bg-mint-dm/30 text-neutral-700' : 'bg-danger/10 dark:bg-danger/10 text-danger'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {u.isActive && !isSelf && (
                          <button onClick={() => setConfirmDeactivate({ userId: u.id, displayName: u.displayName })} className="text-[16px] text-danger hover:underline">Deactivate</button>
                        )}
                        {!u.isActive && (
                          <button onClick={() => handleReactivate(u.id)} className="text-[16px] text-mint hover:underline">Reactivate</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'invitations' && (
        <div>
          <form onSubmit={handleInvite} className="flex gap-2 mb-6">
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" required className="flex-1" />
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
            <Button type="submit">Invite</Button>
          </form>

          {invitations.length > 0 ? (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
                  <div>
                    <p className="text-[16px] text-neutral-700 dark:text-dneutral-700">{inv.email}</p>
                    <p className="text-[16px] text-neutral-400">Role: {inv.role} · Expires: {new Date(inv.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[16px] px-2 py-0.5 rounded ${inv.status === 'pending' ? 'bg-tan-light text-neutral-600' : 'bg-neutral-100 text-neutral-400'}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[16px] text-neutral-400">No pending invitations</p>
          )}
        </div>
      )}

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
