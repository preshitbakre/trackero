import { useState } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const { data } = await apiClient.put('/auth/me', { displayName });
      setUser(data.data);
      setMessage('Profile updated');
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Update failed');
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    if (newPassword.length < 8) {
      setPasswordMessage('Password must be at least 8 characters');
      return;
    }
    try {
      await apiClient.put('/auth/me/password', { currentPassword, newPassword });
      setPasswordMessage('Password changed. You will need to log in again.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMessage(err.response?.data?.message || 'Failed to change password');
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">Profile</h1>

      <form onSubmit={handleUpdateProfile} className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input type="email" value={user?.email || ''} disabled className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          {message && <span className="text-sm text-green-600">{message}</span>}
        </div>
      </form>

      <hr className="border-gray-200 dark:border-gray-800 mb-8" />

      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-4">Change Password</h2>
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Change Password</button>
          {passwordMessage && <span className="text-sm text-red-600">{passwordMessage}</span>}
        </div>
      </form>
    </div>
  );
}
