import { useSearchParams } from 'react-router-dom';
import { KanbanBoard } from '../components/board/KanbanBoard';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';

export function BoardPage() {
  const [searchParams] = useSearchParams();
  const epicFilter = searchParams.get('epicId');

  return (
    <div className="h-full flex flex-col">
      <ReadOnlyBanner />
      <div className="flex-1 min-h-0">
        <KanbanBoard epicFilter={epicFilter ? parseInt(epicFilter) : undefined} />
      </div>
    </div>
  );
}
