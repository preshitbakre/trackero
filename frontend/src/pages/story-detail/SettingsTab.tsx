import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Combobox } from '../../components/ui/Combobox';
import { StoryPointsInput } from '../../components/ui/StoryPointsInput';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusKey } from '../../components/ui/StatusPill';
import { SaveStatusIndicator } from '../../components/common/SaveStatusIndicator';
import type { SaveStatus } from '../../hooks/useTaskAutoSave';
import { AcceptanceCriteria } from './AcceptanceCriteria';
import type { StoryDetail } from './types';

interface Props {
  story: StoryDetail;
  projectId: number;
  canEdit: boolean;
  epics: { id: number; itemKey: string; title: string }[];
  onChanged: () => void;
  onOpenItem: (id: number) => void;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function SettingsTab({ story, projectId, canEdit, epics, onChanged, onOpenItem }: Props) {
  const [title, setTitle] = useState(story.title);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  useEffect(() => { setTitle(story.title); }, [story.title]);

  const currentEpicAssocId = story.associations.belongsTo.find((a) => a.item.itemType === 'epic')?.id ?? null;

  const runSave = async (fn: () => Promise<unknown>) => {
    setSaveStatus('saving');
    try {
      await fn();
      onChanged();
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  const savePoints = (v: number | null) =>
    runSave(() => apiClient.put(`/projects/${projectId}/items/${story.id}`, { storyPoints: v }));

  const setEpic = (newEpicId: number | null) =>
    runSave(async () => {
      if (currentEpicAssocId != null) {
        await apiClient.delete(`/projects/${projectId}/items/${story.id}/associations/${currentEpicAssocId}`);
      }
      if (newEpicId != null) {
        await apiClient.post(`/projects/${projectId}/items/${story.id}/associations`, {
          linkedItemId: newEpicId,
          linkType: 'belongs_to',
        });
      }
    });

  const moveToBacklog = async () => {
    try {
      await apiClient.put(`/projects/${projectId}/items/${story.id}`, { sprintId: null });
      toast('Moved to backlog');
      onChanged();
    } catch { toast('Failed to move', 'error'); }
  };

  const convertToTask = async () => {
    try {
      await apiClient.put(`/projects/${projectId}/items/${story.id}`, { itemType: 'task' });
      toast('Converted to task');
      onChanged();
    } catch { toast('Failed to convert', 'error'); }
  };

  const deleteStory = async () => {
    try {
      // Re-link child tasks/bugs to the parent epic before deleting
      if (story.epic) {
        const children = story.associations.contains;
        await Promise.all(children.map((a) =>
          apiClient.post(`/projects/${projectId}/items/${a.item.id}/associations`, {
            linkedItemId: story.epic!.id,
            linkType: 'belongs_to',
          }).catch(() => {}),
        ));
      }
      await apiClient.delete(`/projects/${projectId}/items/${story.id}`);
      toast('Story deleted — children moved to parent epic');
      onChanged();
    } catch { toast('Failed to delete', 'error'); }
  };

  const linkOptions = [
    ...story.children.map((c) => ({ id: c.id, itemKey: c.itemKey, title: c.title })),
    ...story.associations.contains.map((a) => ({ id: a.item.id, itemKey: a.item.itemKey, title: a.item.title })),
  ];

  return (
    <div className="flex-1 min-w-0 flex">
      {/* Form column */}
      <div className="flex-1 min-w-0 px-[28px] py-6 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[22px] text-text">Identity</h2>
          {canEdit && <SaveStatusIndicator status={saveStatus} />}
        </div>
        <p className="text-[13px] text-mute mb-5">The story title and where it lives in the hierarchy.</p>

        <div className="mb-5">
          <Eyebrow className="mb-1.5">Title</Eyebrow>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            disabled={!canEdit}
          />
        </div>

        <div className="grid grid-cols-2 gap-5 mb-8">
          <div>
            <Eyebrow className="mb-1.5">Parent epic</Eyebrow>
            <Combobox
              value={story.epic ? String(story.epic.id) : ''}
              onChange={(v) => canEdit && setEpic(v ? parseInt(v) : null)}
              placeholder="No epic"
              options={[{ value: '', label: 'No epic' }, ...epics.map((e) => ({ value: String(e.id), label: `${e.itemKey} · ${e.title}` }))]}
            />
            {story.epic && <div className="text-[12px] text-faint mt-1 font-mono">{story.epic.itemKey} · {story.epic.title}</div>}
          </div>
          <div>
            <Eyebrow className="mb-1.5">Story points</Eyebrow>
            <StoryPointsInput value={story.storyPoints} scale="free" onChange={(v) => { if (canEdit) savePoints(v); }} disabled={!canEdit} />
          </div>
        </div>

        <h2 className="font-serif text-[22px] text-text">Acceptance criteria</h2>
        <p className="text-[13px] text-mute mb-4">One or more. Use Given / When / Then format for testable outcomes.</p>
        <AcceptanceCriteria
          projectId={projectId}
          storyId={story.id}
          criteria={story.acceptanceCriteria.list}
          met={story.acceptanceCriteria.met}
          total={story.acceptanceCriteria.total}
          canEdit={canEdit}
          mode="edit"
          linkOptions={linkOptions}
          onChanged={onChanged}
          onOpenItem={onOpenItem}
        />

        {canEdit && (
          <div className="mt-10">
            <h2 className="font-serif text-[22px] text-text">Story operations</h2>
            <div className="flex flex-col gap-4 mt-4">
              <OperationRow
                title="Move to backlog"
                description="Removes from current sprint. Story stays where it is in the hierarchy."
                buttonLabel="Move…"
                onClick={moveToBacklog}
              />
              <OperationRow
                title="Convert to a task"
                description="If this is actually a unit of engineering work — not a user outcome."
                buttonLabel="Convert"
                onClick={convertToTask}
              />
              <OperationRow
                title="Delete this story"
                description="Soft delete with 7 day grace. Children move to the parent epic."
                buttonLabel="Delete…"
                variant="danger"
                onClick={deleteStory}
              />
            </div>
          </div>
        )}
      </div>

      {/* Identity / audit rail */}
      <aside className="w-[280px] flex-shrink-0 bg-paper-2 border-l border-rule px-5 py-6 overflow-y-auto custom-scrollbar">
        <div className="pb-3 border-b border-rule">
          <Eyebrow size="sm" className="mb-2">Story identity</Eyebrow>
          <div className="flex items-center justify-between py-1 text-[13px]">
            <span className="text-faint">ID</span>
            <span className="font-mono text-text">{story.itemKey}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-[13px]">
            <span className="text-faint">Status</span>
            {story.status ? <StatusPill status={(story.status.category as StatusKey) || 'backlog'} /> : <span>—</span>}
          </div>
          <div className="flex items-center justify-between py-1 text-[13px]">
            <span className="text-faint">Epic</span>
            <span className="font-mono text-text">{story.epic?.itemKey ?? '—'}</span>
          </div>
        </div>
        <div className="pt-3">
          <Eyebrow size="sm" className="mb-2">Audit</Eyebrow>
          <div className="text-[12px] text-mute py-1">
            Created {fmtDateTime(story.createdAt)}{story.reporter?.handle && <> by <span className="text-text">@{story.reporter.handle}</span></>}
          </div>
          {story.estimatedAt && (
            <div className="text-[12px] text-mute py-1">
              Estimated {fmtDate(story.estimatedAt)}{story.storyPoints != null && <> · {story.storyPoints} pts</>}
            </div>
          )}
          <div className="text-[12px] text-mute py-1">Last edited {relativeTime(story.updatedAt)}</div>
        </div>
      </aside>
    </div>
  );

  function saveTitle() {
    if (title.trim() && title !== story.title) {
      runSave(() => apiClient.put(`/projects/${projectId}/items/${story.id}`, { title: title.trim() }));
    }
  }
}

function OperationRow({ title, description, buttonLabel, variant, onClick }: {
  title: string;
  description: string;
  buttonLabel: string;
  variant?: 'danger';
  onClick: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-rule last:border-b-0">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-text">{title}</div>
        <div className="text-[13px] text-mute mt-0.5">{description}</div>
      </div>
      <Button
        variant={variant === 'danger' ? 'danger' : 'secondary'}
        size="sm"
        className="flex-shrink-0"
        onClick={onClick}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
