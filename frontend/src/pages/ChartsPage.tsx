import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { Select } from '../components/ui/Select';

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
    apiClient.get(`/projects/${projectId}/velocity`).then((r) => setVelocityData(r.data.data)).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/cumulative-flow`).then((r) => setFlowData(r.data.data)).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => {
      const list = r.data.data.list || [];
      setSprints(list);
      if (!selectedSprintId) {
        const active = list.find((s: any) => s.status === 'active');
        const completed = [...list].filter((s: any) => s.status === 'completed').sort((a: any, b: any) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
        const defaultSprint = active || completed;
        if (defaultSprint) setSelectedSprintId(String(defaultSprint.id));
      }
    }).catch((err) => { console.error(err); });
  }, [projectId]);

  useEffect(() => {
    if (selectedSprintId && projectId) {
      apiClient.get(`/projects/${projectId}/sprints/${selectedSprintId}/burndown`)
        .then((r) => setBurndownData(r.data.data)).catch((err) => { console.error(err); });
    }
  }, [selectedSprintId, projectId]);

  const tabs = [
    { key: 'velocity', label: 'Velocity' },
    { key: 'burndown', label: 'Burndown' },
    { key: 'flow', label: 'Cumulative Flow' },
  ] as const;

  return (
    <div className="p-6">
      <p className="text-[11px] tracking-[0.18em] uppercase font-serif font-semibold text-faint mb-1">
        Project · Charts
      </p>
      <h1 className="font-serif text-[36px] text-text dark:text-dneutral-700 mb-6">Charts</h1>

      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-dneutral-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[16px] font-medium border-b-2 -mb-px ${
              tab === t.key ? 'border-lilac text-lilac-dark' : 'border-transparent text-neutral-400 hover:text-neutral-600'
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
              colors={['#5A83A8']}
              axisLeft={{ legend: 'Story Points', legendPosition: 'middle', legendOffset: -40 }}
              axisBottom={{ tickRotation: -30 }}
              enableLabel={true}
              theme={{ text: { fill: '#6B7280' } }}
              layers={['grid', 'axes', 'bars', 'markers', 'legends', 'annotations',
                ({ bars, yScale }) => {
                  if (bars.length === 0) return null;
                  const avg = bars.reduce((sum: number, b: any) => sum + (b.data.value || 0), 0) / bars.length;
                  const y = (yScale as any)(avg);
                  const first = bars[0];
                  const last = bars[bars.length - 1];
                  return (
                    <line
                      x1={first.x}
                      x2={last.x + last.width}
                      y1={y}
                      y2={y}
                      stroke="#C4A882"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  );
                },
              ]}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">No completed sprints yet</div>
          )}
        </div>
      )}

      {tab === 'burndown' && (
        <div>
          <div className="mb-4 max-w-xs">
            <label className="block text-[16px] font-medium text-neutral-600 dark:text-dneutral-600 mb-1">Sprint</label>
            <Select
              value={selectedSprintId}
              onChange={setSelectedSprintId}
              placeholder="Select a sprint"
              options={[
                { value: '', label: 'Select a sprint' },
                ...sprints.filter((s: any) => s.status === 'active' || s.status === 'completed').map((s: any) => ({ value: String(s.id), label: s.name })),
              ]}
            />
          </div>

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
                colors={['#9BAAB8', '#4A6FA5', '#C4A882']}
                lineWidth={2}
                defs={[]}
                pointSize={4}
                enableSlices="x"
                layers={[
                  'grid', 'markers', 'axes', 'areas', 'crosshair', 'slices', 'points', 'mesh', 'legends',
                  ({ series, lineGenerator, xScale, yScale }) => (
                    <>
                      {series.map((s: any) => {
                        const style: Record<string, string> = {
                          'Ideal': '8 4',
                          'Actual': '',
                          'Scope': '2 4',
                        };
                        const points = s.data.map((d: any) => ({
                          x: (xScale as any)(d.data.x),
                          y: (yScale as any)(d.data.y),
                        }));
                        return (
                          <path
                            key={s.id}
                            d={lineGenerator(points) ?? undefined}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={2}
                            strokeDasharray={style[s.id] || ''}
                          />
                        );
                      })}
                    </>
                  ),
                ]}
                legends={[{ anchor: 'bottom-right', direction: 'column', translateX: 80, itemWidth: 60, itemHeight: 20 }]}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[16px] text-neutral-400">
                {sprints.filter((s: any) => s.status === 'active' || s.status === 'completed').length === 0
                  ? 'Complete a sprint to see burndown data'
                  : selectedSprintId ? 'No burndown data' : 'Complete a sprint to see burndown data'}
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
                { id: 'Backlog', data: flowData.map((d: any) => ({ x: d.date, y: d.backlog ?? 0 })) },
                { id: 'Todo', data: flowData.map((d: any) => ({ x: d.date, y: d.todo ?? 0 })) },
                { id: 'In Progress', data: flowData.map((d: any) => ({ x: d.date, y: d.in_progress ?? 0 })) },
                { id: 'In Review', data: flowData.map((d: any) => ({ x: d.date, y: d.in_review ?? 0 })) },
                { id: 'Done', data: flowData.map((d: any) => ({ x: d.date, y: d.done ?? 0 })) },
              ]}
              margin={{ top: 20, right: 100, bottom: 50, left: 50 }}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', stacked: true, min: 0 }}
              enableArea={true}
              areaOpacity={0.5}
              colors={['#9BAAB880', '#7B9EBF80', '#C4A88280', '#A78BFA80', '#88B5A880']}
              axisLeft={{ legend: 'Tasks', legendPosition: 'middle', legendOffset: -40 }}
              legends={[{ anchor: 'bottom-right', direction: 'column', translateX: 90, itemWidth: 70, itemHeight: 20 }]}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">No data yet</div>
          )}
        </div>
      )}
    </div>
  );
}
