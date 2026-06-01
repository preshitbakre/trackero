import { useState, useEffect, useCallback } from 'react';
import type { EpicDetail, EpicMilestone } from '../../api/epics';
import { getEpicMilestones, createEpicMilestone, deleteEpicMilestone } from '../../api/epics';
import { AcrossSprintsTimeline } from '../../components/epics/AcrossSprintsTimeline';
import { MilestoneFeed } from '../../components/epics/MilestoneFeed';
import { toast } from '../../components/common/Toast';

interface Props {
  epic: EpicDetail;
  projectId: string;
  canEdit: boolean;
}

export function TimelineTab({ epic, projectId, canEdit }: Props) {
  const [milestones, setMilestones] = useState<EpicMilestone[]>([]);

  const load = useCallback(() => {
    getEpicMilestones(projectId, epic.id).then(setMilestones).catch(() => {});
  }, [projectId, epic.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (body: { kind: string; body: string; occurredOn: string }) => {
    try {
      await createEpicMilestone(projectId, epic.id, body);
      toast('Milestone added');
      load();
    } catch {
      toast('Failed to add milestone', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteEpicMilestone(projectId, epic.id, id);
      load();
    } catch {
      toast('Failed to delete milestone', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <AcrossSprintsTimeline
        data={epic.acrossSprints}
        displayState={epic.displayState}
        milestones={milestones}
      />
      <MilestoneFeed milestones={milestones} canEdit={canEdit} onAdd={handleAdd} onDelete={handleDelete} />
    </div>
  );
}
