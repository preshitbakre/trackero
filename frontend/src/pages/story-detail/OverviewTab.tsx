import { Fragment } from 'react';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { MetricNumber } from '../../components/ui/MetricNumber';
import { AcceptanceCriteria } from './AcceptanceCriteria';
import { StoryDiscussion } from './StoryDiscussion';
import type { StoryDetail } from './types';

interface Props {
  story: StoryDetail;
  projectId: number;
  canEdit: boolean;
  onChanged: () => void;
  onOpenItem: (id: number) => void;
}

/** Render light markdown emphasis: `*text*` → <em>. */
function Emphasized({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function OverviewTab({ story, projectId, canEdit, onChanged, onOpenItem }: Props) {
  const statement = story.userStory || story.description || '';
  const progress = story.progress;
  const tasksDone = progress?.completedItems ?? 0;
  const tasksTotal = progress?.totalItems ?? 0;

  const linkOptions = [
    ...story.children.map((c) => ({ id: c.id, itemKey: c.itemKey, title: c.title })),
    ...story.associations.contains.map((a) => ({ id: a.item.id, itemKey: a.item.itemKey, title: a.item.title })),
  ];

  return (
    <div className="flex-1 min-w-0 px-[28px] py-6 overflow-y-auto custom-scrollbar">
      {/* Editorial statement */}
      {statement && (
        <p className="font-serif text-[22px] leading-[1.5] text-text mb-6">
          <Emphasized text={statement} />
        </p>
      )}

      {/* Acceptance criteria */}
      <div className="mb-6">
        <AcceptanceCriteria
          projectId={projectId}
          storyId={story.id}
          criteria={story.acceptanceCriteria.list}
          met={story.acceptanceCriteria.met}
          total={story.acceptanceCriteria.total}
          canEdit={canEdit}
          mode="read"
          linkOptions={linkOptions}
          onChanged={onChanged}
          onOpenItem={onOpenItem}
        />
      </div>

      {/* Metrics row */}
      <div className="flex border border-rule mb-6">
        <Metric value={`${tasksDone}/${tasksTotal}`} label="Tasks done" />
        <Metric value={story.storyPoints ?? 0} label="Story points" divider />
        <Metric value={story.bugCount} label="Bugs found" accent divider />
        <Metric
          value={story.sprint ? story.sprint.name : '—'}
          label={story.sprint ? 'In sprint' : 'No sprint'}
          divider
        />
      </div>

      {/* Context */}
      <div className="mb-8">
        <Eyebrow className="mb-2">Context</Eyebrow>
        {story.description ? (
          <p className="text-[16px] text-mute leading-[1.6] whitespace-pre-wrap">{story.description}</p>
        ) : (
          <p className="text-[16px] text-faint italic">
            Context for this story is pending. The reporter will add details before the sprint starts.
          </p>
        )}
      </div>

      {/* Discussion */}
      <div>
        <StoryDiscussion projectId={projectId} storyId={story.id} canEdit={canEdit} />
      </div>
    </div>
  );
}

function Metric({
  value, label, divider, accent,
}: {
  value: React.ReactNode;
  label: string;
  divider?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex-1 py-4 px-4 ${divider ? 'border-l border-rule' : ''}`}>
      <MetricNumber size="md" className={accent ? 'text-lilac' : 'text-text'}>{value}</MetricNumber>
      <div className="smallcaps mt-2">{label}</div>
    </div>
  );
}
