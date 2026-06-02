import { useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { StoryPointsInput } from '../../components/ui/StoryPointsInput';
import type { RailPatch } from './StoryRightRail';
import type { StoryDetail } from './types';

interface Props {
  story: StoryDetail;
  projectId: number;
  canEdit: boolean;
  canManageProject: boolean;
  statuses: { id: number; name: string; category: string }[];
  sprints: { id: number; name: string }[];
  isWatching: boolean;
  onPatch: (p: RailPatch) => void;
  onApprove: () => void;
  onReopen: () => void;
  onToggleWatch: () => void;
  onOpenReleaseNotes: () => void;
  onChanged: () => void;
}

function firstStatusId(statuses: Props['statuses'], category: string): number | null {
  return statuses.find((s) => s.category === category)?.id ?? null;
}

export function StoryHeaderActions(props: Props) {
  const { story, projectId, canEdit, canManageProject, statuses, sprints, isWatching, onPatch, onApprove, onReopen, onToggleWatch, onOpenReleaseNotes, onChanged } = props;
  const cat = story.status?.category ?? 'backlog';
  const fileRef = useRef<HTMLInputElement>(null);
  const [popover, setPopover] = useState<'estimate' | 'sprint' | null>(null);

  const startWork = () => {
    const id = firstStatusId(statuses, 'in_progress');
    if (id) onPatch({ statusId: id });
  };
  const submitReview = () => {
    const id = firstStatusId(statuses, 'in_review') ?? firstStatusId(statuses, 'done');
    if (id) onPatch({ statusId: id });
  };

  const onAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      await apiClient.post(`/projects/${projectId}/items/${story.id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast('Attachment uploaded');
      onChanged();
    } catch {
      toast('Failed to upload attachment', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const WatchBtn = (
    <Button size="sm" variant="ghost" onClick={onToggleWatch}>
      {isWatching ? 'Watching' : 'Watch'}
    </Button>
  );
  const AttachBtn = (
    <>
      <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Attach</Button>
      <input ref={fileRef} type="file" className="hidden" onChange={onAttach} />
    </>
  );

  if (!canEdit) {
    // Viewers can still watch.
    return <div className="flex items-center gap-2">{WatchBtn}</div>;
  }

  return (
    <div className="flex items-center gap-2 relative">
      {(cat === 'backlog') && (
        <>
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setPopover(popover === 'estimate' ? null : 'estimate')}>Estimate</Button>
            {popover === 'estimate' && (
              <Popover onClose={() => setPopover(null)}>
                <div className="smallcaps mb-2">Story points</div>
                <StoryPointsInput value={story.storyPoints} scale="free" onChange={(v) => { onPatch({ storyPoints: v }); setPopover(null); }} />
              </Popover>
            )}
          </div>
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setPopover(popover === 'sprint' ? null : 'sprint')}>Put into sprint</Button>
            {popover === 'sprint' && (
              <Popover onClose={() => setPopover(null)}>
                <div className="smallcaps mb-2">Sprint</div>
                <Select
                  value={story.sprint ? String(story.sprint.id) : ''}
                  onChange={(v) => { onPatch({ sprintId: v ? parseInt(v) : null }); setPopover(null); }}
                  placeholder="No sprint"
                  options={[{ value: '', label: 'No sprint' }, ...sprints.map((s) => ({ value: String(s.id), label: s.name }))]}
                />
              </Popover>
            )}
          </div>
          <Button size="sm" variant="ink" onClick={startWork}>Start work</Button>
        </>
      )}

      {cat === 'in_progress' && (
        <>
          {AttachBtn}
          {WatchBtn}
          <Button size="sm" variant="ink" onClick={submitReview}>Submit for review</Button>
        </>
      )}

      {cat === 'in_review' && (
        <>
          {AttachBtn}
          {WatchBtn}
          {canManageProject && <Button size="sm" variant="ink" onClick={onApprove}>Approve →</Button>}
        </>
      )}

      {cat === 'done' && (
        <>
          {canManageProject && <Button size="sm" variant="secondary" onClick={onReopen}>Reopen</Button>}
          <Button size="sm" variant="ink" onClick={onOpenReleaseNotes}>View release notes →</Button>
        </>
      )}

      {cat === 'cancelled' && (
        canManageProject && <Button size="sm" variant="secondary" onClick={onReopen}>Reopen</Button>
      )}
    </div>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 mt-1 w-[200px] bg-card border border-rule shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-20 p-3">
        {children}
      </div>
    </>
  );
}
