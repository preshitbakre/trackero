import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { KanbanBoard } from '../components/board/KanbanBoard';

export function EpicBoardPage() {
  const { id: projectId, epicId } = useParams();
  const [epic, setEpic] = useState<{ title: string; color: string } | null>(null);

  useEffect(() => {
    if (projectId && epicId) {
      apiClient.get(`/projects/${projectId}/epics/${epicId}`)
        .then((r) => setEpic(r.data.data))
        .catch(() => {});
    }
  }, [projectId, epicId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-200 dark:border-dneutral-200">
        <Link to={`/projects/${projectId}/epics`} className="text-sm text-neutral-400 hover:text-neutral-500">&larr; Epics</Link>
        {epic && (
          <>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: epic.color }} />
            <h1 className="text-lg font-bold text-neutral-700 dark:text-dneutral-700">{epic.title}</h1>
            <span className="text-sm text-neutral-400">Board View</span>
          </>
        )}
      </div>
      <div className="flex-1">
        <KanbanBoard epicFilter={epicId ? parseInt(epicId) : undefined} />
      </div>
    </div>
  );
}
