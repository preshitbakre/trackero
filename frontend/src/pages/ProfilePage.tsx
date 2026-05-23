import { useState } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Eyebrow } from '../components/ui';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  // Distinguish success from error so the inline message uses the right
  // colour. Default to neutral; flip to success or danger as the request
  // resolves.
  const [passwordMessageKind, setPasswordMessageKind] = useState<'success' | 'danger' | 'neutral'>('neutral');

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
    setPasswordMessageKind('neutral');
    if (newPassword.length < 8) {
      setPasswordMessage('Password must be at least 8 characters');
      setPasswordMessageKind('danger');
      return;
    }
    try {
      await apiClient.put('/auth/me/password', { currentPassword, newPassword });
      setPasswordMessage('Password changed. You will need to log in again.');
      setPasswordMessageKind('success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMessage(err.response?.data?.message || 'Failed to change password');
      setPasswordMessageKind('danger');
    }
  };

  const messageColor =
    passwordMessageKind === 'success'
      ? 'text-success'
      : passwordMessageKind === 'danger'
      ? 'text-danger'
      : 'text-mute';

  return (
    <div className="p-8 max-w-2xl">
      <Eyebrow className="mb-2">Account · {user?.email ?? '—'}</Eyebrow>
      <h1 className="font-serif italic text-[36px] text-text dark:text-dneutral-700 mb-6">
        Profile.
      </h1>

      <form onSubmit={handleUpdateProfile} className="space-y-4 mb-10">
        <div>
          <label className="block text-[14px] font-medium text-mute dark:text-dneutral-600 mb-1">Email</label>
          <Input type="email" value={user?.email || ''} disabled />
        </div>
        <div>
          <label className="block text-[14px] font-medium text-mute dark:text-dneutral-600 mb-1">Display Name</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
          {message && <span className="text-[14px] text-success">{message}</span>}
        </div>
      </form>

      <hr className="border-rule dark:border-dneutral-200 mb-8" />

      <h2 className="font-serif italic text-[24px] text-text dark:text-dneutral-700 mb-4">
        Change password.
      </h2>
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div>
          <label className="block text-[14px] font-medium text-mute dark:text-dneutral-600 mb-1">Current Password</label>
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="block text-[14px] font-medium text-mute dark:text-dneutral-600 mb-1">New Password</label>
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Change password</Button>
          {passwordMessage && (
            <span className={`text-[14px] ${messageColor}`}>{passwordMessage}</span>
          )}
        </div>
      </form>
    </div>
  );
}
