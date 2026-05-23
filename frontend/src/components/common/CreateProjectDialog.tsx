import { useState } from 'react';
import { apiClient } from '../../api/client';
import { queryClient } from '../../lib/query-client';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from './Modal';

function generatePrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 5) {
    return words.slice(0, 5).map((w) => w[0]).join('').toUpperCase();
  }
  if (words.length >= 2) {
    const initials = words.map((w) => w[0].toUpperCase()).join('');
    if (initials.length >= 5) return initials.slice(0, 5);
    // Pad from first word's remaining letters
    const needed = 5 - initials.length;
    const extra = words[0].slice(1, 1 + needed).toUpperCase();
    return (initials[0] + extra + initials.slice(1)).slice(0, 5);
  }
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase();
}

export function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!prefixTouched) {
      setPrefix(generatePrefix(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/projects', { name, prefix: prefix.toUpperCase(), description: description || undefined });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const titleId = 'create-project-dialog-title';

  return (
    <Modal
      open
      onClose={onClose}
      titleId={titleId}
      contentClassName="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-dneutral-200 rounded-lg p-6 shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] focus:outline-none"
    >
      <h2 id={titleId} className="text-[22px] font-bold mb-4 text-neutral-700 dark:text-dneutral-700">Create Project</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-[16px] text-danger">{error}</div>}
        <div>
          <label className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Name</label>
          <Input
            type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} required
            placeholder="e.g. Cubitraq"
          />
        </div>
        <div>
          <label className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Prefix</label>
          <Input
            type="text" value={prefix}
            onChange={(e) => { setPrefixTouched(true); setPrefix(e.target.value.toUpperCase()); }}
            required pattern="[A-Z0-9]{2,5}" maxLength={5}
            className="font-mono"
          />
          <p className="text-[16px] text-neutral-400 mt-1">Auto-generated from name. Edit if needed.</p>
        </div>
        <div>
          <label className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Description (optional)</label>
          <Textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="What is this project about?"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
