import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { Drawer } from '../../components/common/Drawer';
import { MarkdownField } from '../../components/ui/MarkdownField';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Button } from '../../components/ui/Button';

interface Props {
  projectId: number;
  storyId: number;
  storyKey: string;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
}

export function ReleaseNotesDrawer({ projectId, storyId, storyKey, canEdit, open, onClose }: Props) {
  const [body, setBody] = useState('');
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    apiClient.get(`/projects/${projectId}/items/${storyId}/release-notes`)
      .then((res) => {
        setBody(res.data.data.body || '');
        setPublishedAt(res.data.data.publishedAt || null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, projectId, storyId]);

  const save = async (publish: boolean) => {
    try {
      const res = await apiClient.put(`/projects/${projectId}/items/${storyId}/release-notes`, { body, publish });
      setPublishedAt(res.data.data.publishedAt || null);
      toast(publish ? 'Release notes published' : 'Release notes saved');
    } catch {
      toast('Failed to save release notes', 'error');
    }
  };

  return (
    <Drawer open={open} onClose={onClose} ariaLabel="Release notes">
      <div className="p-6 h-full flex flex-col">
        <Eyebrow className="mb-1">Release notes · {storyKey}</Eyebrow>
        <h2 className="font-serif text-[22px] text-text mb-1">Release notes</h2>
        <p className="text-[12px] text-mute mb-4">
          {publishedAt ? `Published ${new Date(publishedAt).toLocaleDateString()}` : 'Not published yet'}
        </p>

        {loaded && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {canEdit ? (
              <MarkdownField value={body} onChange={setBody} placeholder="What shipped in this story?" />
            ) : body ? (
              <MarkdownField value={body} onChange={() => {}} readOnly />
            ) : (
              <p className="text-[14px] text-faint italic">No release notes yet.</p>
            )}
          </div>
        )}

        {canEdit && (
          <div className="flex items-center gap-2 pt-4 border-t border-rule mt-4">
            <Button variant="ink" size="sm" onClick={() => save(true)}>Publish</Button>
            <Button variant="ghost" size="sm" onClick={() => save(false)}>Save draft</Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
