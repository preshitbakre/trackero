import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { useAuthStore } from '../../store/auth.store';
import { Select } from '../ui/Select';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ErrorState } from '../common/ErrorState';

interface MemberRow {
  id: number;
  userId: number;
  role: string;
  user: {
    id: number;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
  };
}

interface SearchUser {
  id: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export function MembersTab() {
  const { id: projectId } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [removingMember, setRemovingMember] = useState<MemberRow | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/members`);
      setMembers(data.data.list || []);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignored = false;
    const load = async () => {
      setError(false);
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/members`);
        if (ignored) return;
        setMembers(data.data.list || []);
      } catch (err) {
        console.error(err);
        if (!ignored) setError(true);
      }
      if (!ignored) setLoading(false);
    };
    load();
    return () => { ignored = true; };
  }, [projectId]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await apiClient.put(`/projects/${projectId}/members/${userId}`, { role: newRole });
      loadMembers();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update role', 'error');
    }
  };

  const handleRemove = async (member: MemberRow) => {
    try {
      await apiClient.delete(`/projects/${projectId}/members/${member.userId}`);
      setRemovingMember(null);
      loadMembers();
      toast('Member removed');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to remove member', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-neutral-200 dark:bg-dneutral-200 rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load members" onRetry={loadMembers} />;
  }

  const roleOptions = isAdmin
    ? [{ value: 'project_manager', label: 'Project Manager' }, { value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }]
    : [{ value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-semibold text-neutral-700 dark:text-dneutral-700">
          Members ({members.length})
        </h2>
        <Button variant="primary" onClick={() => setShowAddDialog(true)}>+ Add member</Button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 dark:text-dneutral-500">
          <p>No members yet. Add team members to start collaborating.</p>
        </div>
      ) : (
        <div className="rounded-lg shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden">
          {members.map((m, i) => {
            const isInstanceAdmin = m.user.role === 'admin';
            const isSelf = m.userId === currentUser?.id;
            const initial = m.user.displayName?.charAt(0)?.toUpperCase() || '?';

            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-neutral-100 dark:border-dneutral-200' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-peri-light dark:bg-peri-dm/30 flex items-center justify-center text-[16px] font-medium text-peri dark:text-peri-dm flex-shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 truncate">{m.user.displayName}</p>
                  <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 truncate">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isInstanceAdmin ? (
                    <span className="text-[16px] text-neutral-400 dark:text-dneutral-500 px-2 py-1 bg-neutral-100 dark:bg-dneutral-200 rounded">Admin (instance)</span>
                  ) : (
                    <Select
                      value={m.role}
                      onChange={(val) => handleRoleChange(m.userId, val)}
                      options={roleOptions}
                    />
                  )}
                  {!isInstanceAdmin && !isSelf && (
                    <button
                      onClick={() => setRemovingMember(m)}
                      className="text-[16px] text-danger hover:text-danger/80 px-1"
                      title="Remove from project"
                    >
                      &#x2715;
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddDialog && (
        <AddMemberDialog
          projectId={projectId!}
          isAdmin={isAdmin}
          onClose={() => setShowAddDialog(false)}
          onAdded={() => { setShowAddDialog(false); loadMembers(); toast('Member added'); }}
        />
      )}

      {removingMember && (
        <ConfirmDialog
          title="Remove member"
          message={`Remove ${removingMember.user.displayName} from this project?`}
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemove(removingMember)}
          onCancel={() => setRemovingMember(null)}
        />
      )}
    </div>
  );
}

function AddMemberDialog({ projectId, isAdmin, onClose, onAdded }: {
  projectId: string;
  isAdmin: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search.length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }
    let ignored = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (ignored) return;
      setSearching(true);
      try {
        const { data } = await apiClient.get(`/users?exclude_project=${projectId}&search=${encodeURIComponent(search)}&limit=10`);
        if (ignored) return;
        setResults(data.data.list || []);
        setShowResults(true);
      } catch (err) { console.error(err); }
      if (!ignored) setSearching(false);
    }, 300);
    return () => {
      ignored = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, projectId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async () => {
    if (!selectedUser) return;
    setError('');
    setLoading(true);
    try {
      await apiClient.post(`/projects/${projectId}/members`, { userId: selectedUser.id, role });
      onAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add member');
    }
    setLoading(false);
  };

  const roleOptions = isAdmin
    ? [{ value: 'project_manager', label: 'Project Manager' }, { value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }]
    : [{ value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-700/50" onClick={onClose}>
      <div className="bg-white dark:bg-dneutral-100 rounded-lg p-6 w-full max-w-md shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Add member</h2>

        {error && <div className="text-[16px] text-danger mb-3">{error}</div>}

        <div className="space-y-4">
          {/* User search */}
          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Search user</label>
            {selectedUser ? (
              <div className="flex items-center gap-2 p-2 rounded-md border border-peri bg-peri-light dark:bg-peri-dm/30">
                <div className="w-6 h-6 rounded-full bg-peri-light dark:bg-peri-dm/30 flex items-center justify-center text-[16px] font-medium text-peri dark:text-peri-dm">
                  {selectedUser.displayName?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[16px] text-neutral-700 dark:text-dneutral-700">{selectedUser.displayName}</span>
                  <span className="text-[16px] text-neutral-400 dark:text-dneutral-500 ml-2">{selectedUser.email}</span>
                </div>
                <button onClick={() => { setSelectedUser(null); setSearch(''); }} className="text-[16px] text-neutral-400 hover:text-neutral-600">&#x2715;</button>
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  placeholder="Search by name or email..."
                  autoFocus
                />
                {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-neutral-400">...</span>}
                {showResults && results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-white dark:bg-dneutral-200 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] max-h-48 overflow-y-auto">
                    {results.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUser(u); setShowResults(false); setSearch(''); }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-dneutral-300"
                      >
                        <div className="w-6 h-6 rounded-full bg-peri-light dark:bg-peri-dm/30 flex items-center justify-center text-[16px] font-medium text-peri dark:text-peri-dm">
                          {u.displayName?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{u.displayName}</p>
                          <p className="text-[16px] text-neutral-400 dark:text-dneutral-500 truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showResults && results.length === 0 && search.length >= 1 && !searching && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-white dark:bg-dneutral-200 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3 text-[16px] text-neutral-400 text-center">
                    No users found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Role</label>
            <Select value={role} onChange={setRole} options={roleOptions} className="w-full" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!selectedUser || loading}>
            {loading ? 'Adding...' : 'Add member'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
