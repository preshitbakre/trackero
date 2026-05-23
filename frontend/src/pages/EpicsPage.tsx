import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { LabelList } from '../components/ui/LabelBadge';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorState } from '../components/common/ErrorState';

interface Epic {
  id: number;
  itemType: string;
  title: string;
  priority: string;
  color: string;
  createdAt: string;
  status: { id: number; name: string; category: string; color: string } | null;
  assignee: { id: number; displayName: string } | null;
  sprint: { id: number; name: string } | null;
  endDate: string | null;
  storyPoints: number | null;
  progress: {
    totalItems: number;
    completedItems: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
  };
  childBreakdown: {
    stories: number;
    tasks: number;
    subtasks: number;
  };
  labels?: { id: number; name: string; color: string }[];
}

export function EpicsPage() {
  const { id: projectId } = useParams();
  const [epics, setEpics] = useState<Epic[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { canEdit } = useRole();

  const loadEpics = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/epics`);
      setEpics(data.data.list || []);
    } catch (err) {
      console.error(err);
      setError(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadEpics();
  }, [loadEpics]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700">Epics</h1>
        {canEdit && (
          <Button onClick={() => setShowCreate(true)}>+ Create Epic</Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load epics" onRetry={loadEpics} />
      ) : epics.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 dark:text-dneutral-500">
          <p>Epics help you group related work. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => (
            <div
              key={epic.id}
              className="p-4 rounded-lg bg-white dark:bg-dneutral-100 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: epic.color }} />
                <h3 className="flex-1 min-w-0 text-[16px] font-medium text-neutral-700 dark:text-dneutral-700 truncate">
                  {epic.title}
                </h3>
                {epic.status && (
                  <span
                    className="text-[14px] px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${epic.status.color}20`, color: epic.status.color }}
                  >
                    {epic.status.name}
                  </span>
                )}
              </div>

              {epic.progress && (
                <>
                  <div className="mt-2 text-[14px] text-neutral-400 dark:text-dneutral-500">
                    {epic.progress.completedItems} of {epic.progress.totalItems} items complete
                    &middot; {epic.progress.completedPoints} of {epic.progress.totalPoints} pts done
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-100 dark:bg-dneutral-200">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${epic.progress.progressPercent}%`, backgroundColor: epic.color }}
                    />
                  </div>
                </>
              )}

              {epic.childBreakdown && (
                <div className="mt-2 text-[14px] text-neutral-400 dark:text-dneutral-500">
                  Contains: {epic.childBreakdown.stories} stories &middot; {epic.childBreakdown.tasks} tasks &middot; {epic.childBreakdown.subtasks} subtasks
                </div>
              )}

              {epic.labels && epic.labels.length > 0 && (
                <div className="mt-2">
                  <LabelList labels={epic.labels} max={4} />
                </div>
              )}

              {epic.assignee && (
                <div className="mt-1 text-[14px] text-neutral-400 dark:text-dneutral-500">
                  Assigned: {epic.assignee.displayName}
                </div>
              )}

              {epic.endDate && (
                <div className="mt-1 text-[14px] text-neutral-400 dark:text-dneutral-500">
                  End: {new Date(epic.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}

              <div className="mt-3">
                <Link
                  to={`/projects/${projectId}/epics/${epic.id}`}
                  className="text-[14px] text-peri hover:underline"
                >
                  View details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && projectId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType="epic"
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadEpics();
          }}
        />
      )}
    </div>
  );
}
