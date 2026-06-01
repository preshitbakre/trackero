import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronsUp, ArrowUp, ArrowRight, ArrowDown, Minus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusKey } from '../../components/ui/StatusPill';
import { Select } from '../../components/ui/Select';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { StoryPointsInput } from '../../components/ui/StoryPointsInput';
import { ChildrenProgressBar } from '../../components/ui/ChildrenProgressBar';
import { TypeTag } from '../../components/ui/TypeTag';
import { LabelList } from '../../components/ui/LabelBadge';
import { LabelPicker } from '../../components/ui/LabelPicker';
import { PRIORITY_DOT_COLORS } from '../../lib/colors';
import type { StoryDetail, DetailUser } from './types';

export interface RailPatch {
  statusId?: number;
  assigneeId?: number | null;
  sprintId?: number | null;
  storyPoints?: number | null;
  priority?: string;
  labelIds?: number[];
}

interface Props {
  story: StoryDetail;
  canEdit: boolean;
  members: DetailUser[];
  sprints: { id: number; name: string }[];
  statuses: { id: number; name: string; category: string }[];
  watchers: DetailUser[];
  isWatching: boolean;
  onPatch: (p: RailPatch) => void;
  onToggleWatch: () => void;
}

function PriorityIcon({ priority }: { priority: string }) {
  const color = PRIORITY_DOT_COLORS[priority] ?? PRIORITY_DOT_COLORS.none;
  const Icon = priority === 'urgent' ? ChevronsUp
    : priority === 'high' ? ArrowUp
    : priority === 'low' ? ArrowDown
    : priority === 'none' ? Minus
    : ArrowRight;
  return <Icon size={14} style={{ color }} />;
}

function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1.5">
        <Eyebrow size="sm">{label}</Eyebrow>
        {action}
      </div>
      {children}
    </div>
  );
}

export function StoryRightRail({
  story, canEdit, members, sprints, statuses, watchers, isWatching, onPatch, onToggleWatch,
}: Props) {
  const navigate = useNavigate();
  const { id: projectId } = useParams();

  return (
    <aside className="w-[320px] flex-shrink-0 bg-paper-2 border-l border-rule px-5 py-2 overflow-y-auto custom-scrollbar">
      <Section label="Status">
        {canEdit ? (
          <Select
            value={String(story.status?.id ?? '')}
            onChange={(v) => onPatch({ statusId: parseInt(v) })}
            options={statuses.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        ) : story.status ? (
          <StatusPill status={(story.status.category as StatusKey) || 'backlog'} />
        ) : (
          <span className="text-mute text-[13px]">—</span>
        )}
      </Section>

      <Section label="Assignee">
        {canEdit ? (
          <Select
            value={String(story.assignee?.id ?? '')}
            onChange={(v) => onPatch({ assigneeId: v ? parseInt(v) : null })}
            placeholder="Unassigned"
            options={[
              { value: '', label: 'Unassigned' },
              ...members.map((m) => ({ value: String(m.id), label: m.displayName })),
            ]}
          />
        ) : story.assignee ? (
          <div className="flex items-center gap-2">
            <Avatar user={story.assignee} size="sm" />
            <div className="min-w-0">
              <div className="text-[13px] text-text truncate">{story.assignee.displayName}</div>
              {story.assignee.handle && <div className="text-[12px] text-faint">@{story.assignee.handle}</div>}
            </div>
          </div>
        ) : (
          <span className="text-mute text-[13px]">Unassigned</span>
        )}
      </Section>

      <Section label="Parent epic">
        {story.epic ? (
          <button
            type="button"
            onClick={() => navigate(`/projects/${projectId}/epics/${story.epic!.id}`)}
            className="w-full flex items-center gap-2 bg-card border-l-[3px] border-lilac px-3 py-2 text-left hover:bg-shade transition-colors"
          >
            <TypeTag kind="epic" />
            <div className="min-w-0">
              <div className="text-[13px] text-text font-medium truncate">{story.epic.title}</div>
              <div className="font-mono text-[11px] text-faint">{story.epic.itemKey}</div>
            </div>
          </button>
        ) : (
          <span className="text-mute text-[13px]">No epic</span>
        )}
      </Section>

      <div className="flex gap-4 py-3">
        <div className="flex-1">
          <Eyebrow size="sm" className="mb-1.5">Points</Eyebrow>
          {canEdit ? (
            <StoryPointsInput value={story.storyPoints} scale="free" onChange={(v) => onPatch({ storyPoints: v })} />
          ) : (
            <span className="font-serif text-[28px] text-text leading-none">{story.storyPoints ?? '—'}</span>
          )}
        </div>
        <div className="flex-1">
          <Eyebrow size="sm" className="mb-1.5">Priority</Eyebrow>
          {canEdit ? (
            <Select
              value={story.priority}
              onChange={(v) => onPatch({ priority: v })}
              options={['urgent', 'high', 'medium', 'low', 'none'].map((p) => ({ value: p, label: p }))}
            />
          ) : (
            <span className="inline-flex items-center gap-1 text-[14px] capitalize text-text">
              <PriorityIcon priority={story.priority} />
              {story.priority}
            </span>
          )}
        </div>
      </div>

      <Section label="Sprint">
        {canEdit ? (
          <Select
            value={String(story.sprint?.id ?? '')}
            onChange={(v) => onPatch({ sprintId: v ? parseInt(v) : null })}
            placeholder="No sprint"
            options={[
              { value: '', label: 'No sprint' },
              ...sprints.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          />
        ) : story.sprint ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text">
            <span className="w-2 h-2 rounded-full bg-lilac" /> {story.sprint.name}
          </span>
        ) : (
          <span className="text-mute text-[13px]">No sprint</span>
        )}
      </Section>

      <Section label="Labels">
        {canEdit && projectId ? (
          <LabelPicker
            projectId={parseInt(projectId)}
            selectedIds={story.labels.map((l) => l.id)}
            onChange={(ids) => onPatch({ labelIds: ids })}
          />
        ) : story.labels.length > 0 ? (
          <LabelList labels={story.labels} max={6} />
        ) : (
          <span className="text-mute text-[13px]">No labels</span>
        )}
      </Section>

      <Section label={`Children · ${story.progress?.totalItems ?? 0}`}>
        <ChildrenBar story={story} />
      </Section>

      {projectId && <AttachmentsSection projectId={parseInt(projectId)} storyId={story.id} count={story.attachmentCount} />}

      <Section
        label={`Watchers · ${watchers.length}`}
        action={
          canEdit ? (
            <button type="button" onClick={onToggleWatch} className="text-[11px] text-lilac-dark hover:underline">
              {isWatching ? 'Unwatch' : 'Watch'}
            </button>
          ) : undefined
        }
      >
        {watchers.length > 0 ? (
          <AvatarStack users={watchers} max={6} size="sm" />
        ) : (
          <span className="text-mute text-[13px]">No watchers</span>
        )}
      </Section>
    </aside>
  );
}

function ChildrenBar({ story }: { story: StoryDetail }) {
  const b = story.childStatusBreakdown;
  return <ChildrenProgressBar done={b.done} wip={b.wip} open={b.open} />;
}

interface Attachment { id: number; originalFilename: string; sizeBytes: number }

function AttachmentsSection({ projectId, storyId, count }: { projectId: number; storyId: number; count: number }) {
  const [items, setItems] = useState<Attachment[]>([]);

  useEffect(() => {
    apiClient.get(`/projects/${projectId}/items/${storyId}/attachments`)
      .then((res) => setItems(res.data.data.list || []))
      .catch(() => setItems([]));
    // Re-fetch when the count changes (e.g. after an Attach upload).
  }, [projectId, storyId, count]);

  if (items.length === 0) return null;

  const download = async (id: number) => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items/${storyId}/attachments/${id}/url`);
      if (data.data?.url) window.open(data.data.url, '_blank', 'noopener');
    } catch { /* ignore */ }
  };

  return (
    <Section label={`Attachments · ${items.length}`}>
      <div className="flex flex-col gap-1">
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => download(a.id)}
            className="flex items-center justify-between gap-2 text-[12px] text-text hover:text-lilac-dark text-left"
          >
            <span className="truncate">{a.originalFilename}</span>
            <span className="text-faint flex-shrink-0">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
          </button>
        ))}
      </div>
    </Section>
  );
}
