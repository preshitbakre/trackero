import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-4">Settings</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">App Name</label>
            <input type="text" value={settings.appName || ''} onChange={(e) => setSettings({ ...settings, appName: e.target.value })} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Role for New Users</label>
            <select value={settings.defaultRole || 'member'} onChange={(e) => setSettings({ ...settings, defaultRole: e.target.value })} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="project_manager">Project Manager</option>
            </select>
          </div>
          <button onClick={handleSaveSettings} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Email</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Role</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 px-3 text-gray-900 dark:text-gray-50">{u.displayName}</td>
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                    <td className="py-2 px-3">
                      <select value={u.role} onChange={(e) => handleChangeRole(u.id, e.target.value)} className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent px-1 py-0.5">
                        <option value="admin">Admin</option>
                        <option value="project_manager">PM</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${u.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {u.isActive && (
                        <button onClick={() => handleDeactivate(u.id)} className="text-xs text-red-500 hover:underline">Deactivate</button>
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
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" required className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="project_manager">PM</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90">Invite</button>
          </form>

          {invitations.length > 0 ? (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-800">
                  <div>
                    <p className="text-sm text-gray-900 dark:text-gray-50">{inv.email}</p>
                    <p className="text-xs text-gray-400">Role: {inv.role} · Expires: {new Date(inv.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${inv.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No pending invitations</p>
          )}
        </div>
      )}
    </div>
  );
}
