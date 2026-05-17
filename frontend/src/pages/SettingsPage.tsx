import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';

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

export function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'members' | 'invitations'>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadUsers();
    loadInvitations();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await apiClient.get('/settings');
      setSettings(data.data);
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const { data } = await apiClient.get('/users');
      setUsers(data.data.list || []);
    } catch {}
  };

  const loadInvitations = async () => {
    try {
      const { data } = await apiClient.get('/users/invitations');
      // This endpoint doesn't exist yet — gracefully handle
      setInvitations(data?.data?.list || []);
    } catch {}
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.put('/settings', settings);
    } catch {}
    setSaving(false);
  };

  const handleChangeRole = async (userId: number, role: string) => {
    try {
      await apiClient.put(`/users/${userId}/role`, { role });
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to change role');
    }
  };

  const handleDeactivate = async (userId: number) => {
    try {
      await apiClient.put(`/users/${userId}/deactivate`);
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed');
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
      alert(err.response?.data?.message || 'Failed to send invitation');
    }
  };

  const tabs = [
    { key: 'general', label: 'General' },
    { key: 'members', label: 'Members' },
    { key: 'invitations', label: 'Invitations' },
  ] as const;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700 mb-4">Settings</h1>

      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-dneutral-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600 mb-1">App Name</label>
            <Input value={settings.appName || ''} onChange={(e) => setSettings({ ...settings, appName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Default Role for New Users</label>
            <Select
              value={settings.defaultRole || 'member'}
              onChange={(val) => setSettings({ ...settings, defaultRole: val })}
              options={[
                { value: 'member', label: 'Member' },
                { value: 'viewer', label: 'Viewer' },
                { value: 'project_manager', label: 'Project Manager' },
              ]}
              className="w-full"
            />
          </div>
          <button onClick={handleSaveSettings} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-100 dark:border-dneutral-200">
                    <td className="py-2 px-3 text-neutral-700 dark:text-dneutral-700">{u.displayName}</td>
                    <td className="py-2 px-3 text-neutral-500 dark:text-dneutral-500">{u.email}</td>
                    <td className="py-2 px-3">
                      <Select
                        value={u.role}
                        onChange={(val) => handleChangeRole(u.id, val)}
                        options={[
                          { value: 'admin', label: 'Admin' },
                          { value: 'project_manager', label: 'PM' },
                          { value: 'member', label: 'Member' },
                          { value: 'viewer', label: 'Viewer' },
                        ]}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-sm px-2 py-0.5 rounded ${u.isActive ? 'bg-secondary-100 dark:bg-dsecondary-100 text-secondary-700' : 'bg-danger/10 dark:bg-danger/10 text-danger'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {u.isActive && (
                        <button onClick={() => handleDeactivate(u.id)} className="text-sm text-danger hover:underline">Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
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
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600">Invite</button>
          </form>

          {invitations.length > 0 ? (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded border border-neutral-200 dark:border-dneutral-200">
                  <div>
                    <p className="text-sm text-neutral-700 dark:text-dneutral-700">{inv.email}</p>
                    <p className="text-sm text-neutral-400">Role: {inv.role} · Expires: {new Date(inv.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-sm px-2 py-0.5 rounded ${inv.status === 'pending' ? 'bg-accent-100 text-accent-700' : 'bg-neutral-100 text-neutral-400'}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No pending invitations</p>
          )}
        </div>
      )}
    </div>
  );
}
