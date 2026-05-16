import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';

export function ChartsPage() {
  const { id: projectId } = useParams();
  const [tab, setTab] = useState<'burndown' | 'velocity' | 'flow'>('velocity');
  const [velocityData, setVelocityData] = useState<any[]>([]);
  const [flowData, setFlowData] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [burndownData, setBurndownData] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/velocity`).then((r) => setVelocityData(r.data.data)).catch(() => {});
    apiClient.get(`/projects/${projectId}/cumulative-flow`).then((r) => setFlowData(r.data.data)).catch(() => {});
    apiClient.get(`/projects/${projectId}/sprints?limit=-1`).then((r) => setSprints(r.data.data.list || [])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (selectedSprintId && projectId) {
      apiClient.get(`/projects/${projectId}/sprints/${selectedSprintId}/burndown`)
        .then((r) => setBurndownData(r.data.data)).catch(() => {});
    }
  }, [selectedSprintId, projectId]);

  const tabs = [
    { key: 'velocity', label: 'Velocity' },
    { key: 'burndown', label: 'Burndown' },
    { key: 'flow', label: 'Cumulative Flow' },
  ] as const;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-4">Charts</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'velocity' && (
        <div className="h-[400px]">
          {velocityData.length > 0 ? (
            <ResponsiveBar
              data={velocityData.map((d: any) => ({ sprint: d.name, points: d.completed_points }))}
              keys={['points']}
              indexBy="sprint"
              margin={{ top: 20, right: 20, bottom: 50, left: 50 }}
              padding={0.3}
              colors={['#6366F1']}
              axisLeft={{ legend: 'Story Points', legendPosition: 'middle', legendOffset: -40 }}
              axisBottom={{ tickRotation: -30 }}
              enableLabel={true}
              theme={{ text: { fill: '#6B7280' } }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">No completed sprints yet</div>
          )}
        </div>
      )}

      {tab === 'burndown' && (
        <div>
          <select
            value={selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="mb-4 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5"
          >
            <option value="">Select a sprint</option>
            {sprints.filter((s: any) => s.status === 'active' || s.status === 'completed').map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <div className="h-[400px]">
            {burndownData?.dataPoints?.length > 0 ? (
              <ResponsiveLine
                data={[
                  { id: 'Ideal', data: burndownData.dataPoints.map((p: any) => ({ x: p.date, y: p.ideal })) },
                  { id: 'Actual', data: burndownData.dataPoints.map((p: any) => ({ x: p.date, y: p.actual })) },
                  { id: 'Scope', data: burndownData.dataPoints.map((p: any) => ({ x: p.date, y: p.scope })) },
                ]}
                margin={{ top: 20, right: 100, bottom: 50, left: 50 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0 }}
                axisLeft={{ legend: 'Points', legendPosition: 'middle', legendOffset: -40 }}
                colors={['#9CA3AF', '#6366F1', '#F97316']}
                pointSize={4}
                enableSlices="x"
                legends={[{ anchor: 'bottom-right', direction: 'column', translateX: 80, itemWidth: 60, itemHeight: 20 }]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                {selectedSprintId ? 'No burndown data' : 'Select a sprint to view burndown'}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'flow' && (
        <div className="h-[400px]">
          {flowData.length > 0 ? (
            <ResponsiveLine
              data={[
                { id: 'Backlog', data: flowData.map((d: any) => ({ x: d.date, y: d.backlog })) },
                { id: 'Todo', data: flowData.map((d: any) => ({ x: d.date, y: d.todo })) },
                { id: 'In Progress', data: flowData.map((d: any) => ({ x: d.date, y: d.in_progress })) },
                { id: 'In Review', data: flowData.map((d: any) => ({ x: d.date, y: d.in_review })) },
                { id: 'Done', data: flowData.map((d: any) => ({ x: d.date, y: d.done })) },
              ]}
              margin={{ top: 20, right: 100, bottom: 50, left: 50 }}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', stacked: true, min: 0 }}
              enableArea={true}
              areaOpacity={0.6}
              colors={['#6B7280', '#3B82F6', '#F59E0B', '#8B5CF6', '#22C55E']}
              axisLeft={{ legend: 'Tasks', legendPosition: 'middle', legendOffset: -40 }}
              legends={[{ anchor: 'bottom-right', direction: 'column', translateX: 90, itemWidth: 70, itemHeight: 20 }]}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">No data yet</div>
          )}
        </div>
      )}
    </div>
  );
}
