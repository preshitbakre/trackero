import { useParams } from 'react-router-dom';
import { TypeTag } from '../../components/ui/TypeTag';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusKey } from '../../components/ui/StatusPill';
import { StoryCard } from '../../components/stories/StoryCard';
import { epicStateToPill } from '../../api/epics';
import type { StoryGroup } from './helpers';

function statusDot(cat?: string | null): string {
  switch (cat) {
    case 'done': return '#88D68E';
    case 'in_progress': return '#D6B588';
    case 'in_review': return '#D688D0';
    case 'cancelled': return '#E05252';
    default: return '#A8A1B5';
  }
}

function GroupHeader({ group }: { group: StoryGroup }) {
  const { header } = group;
  return (
    <div className="flex items-center gap-2.5">
      {header.kind === 'epic' && header.epicId != null && <TypeTag kind="epic" size="xs" />}
      {header.kind === 'epic' && header.epicKey && (
        <span className="font-mono text-[11px] text-faint">{header.epicKey}</span>
      )}
      {header.kind === 'status' && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusDot(header.statusCategory) }}
          aria-hidden
        />
      )}
      <span className="text-[12px] tracking-[0.14em] uppercase font-semibold text-text">{header.title}</span>
      {header.kind === 'epic' && header.health && (
        <StatusPill status={epicStateToPill(header.health) as StatusKey} dot caps />
      )}
      <div className="flex-1 h-px bg-rule" />
      <span className="font-mono text-[10.5px] text-faint whitespace-nowrap">
        {header.kind === 'epic'
          ? `${group.doneCount}/${group.totalCount} done · ${group.points} pts`
          : `${group.totalCount} stor${group.totalCount === 1 ? 'y' : 'ies'} · ${group.points} pts`}
      </span>
    </div>
  );
}

interface Props {
  groups: StoryGroup[];
}

export function StoriesTable({ groups }: Props) {
  const { id: projectId } = useParams();

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <GroupHeader group={group} />
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {group.items.map((s) => (
              <StoryCard key={s.id} story={s} projectId={projectId!} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
