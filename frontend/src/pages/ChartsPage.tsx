import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { Select } from '../components/ui/Select';
import { PageHeader } from '../components/ui/PageHeader';
import { useProjectMethodology } from '../hooks/useProjectMethodology';

export function ChartsPage() {
  const { id: projectId } = useParams();
  const { methodology } = useProjectMethodology(projectId);
  const isKanban = methodology === 'kanban';
  const [tab, setTab] = useState<'burndown' | 'velocity' | 'flow' | 'throughput' | 'cycle'>('velocity');
  const [velocityData, setVelocityData] = useState<any[]>([]);
  const [flowData, setFlowData] = useState<any[]>([]);
  const [throughputData, setThroughputData] = useState<any[]>([]);
  const [cycleTimeData, setCycleTimeData] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [burndownData, setBurndownData] = useState<any>(null);
  const [sprintsLoaded, setSprintsLoaded] = useState(false);

  const eligibleSprints = sprints.filter((s: any) => s.status === 'active' || s.status === 'completed');
  const hasSprints = sprints.length > 0;
  const hasEligibleSprints = eligibleSprints.length > 0;

  useEffect(() => {
    if (isKanban) setTab('flow');
  }, [isKanban]);

  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}/cumulative-flow`).then((r) => setFlowData(r.data.data)).catch((err) => { console.error(err); });
    if (isKanban) return;
    apiClient.get(`/projects/${projectId}/velocity`).then((r) => setVelocityData(r.data.data)).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => {
      const list = r.data.data.list || [];
      setSprints(list);
      setSprintsLoaded(true);
      if (!selectedSprintId) {
        const active = list.find((s: any) => s.status === 'active');
        const completed = [...list].filter((s: any) => s.status === 'completed').sort((a: any, b: any) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
        const defaultSprint = active || completed;
        if (defaultSprint) setSelectedSprintId(String(defaultSprint.id));
      }
    }).catch((err) => { console.error(err); });
  }, [projectId, isKanban]);

  useEffect(() => {
    if (!projectId) return;
    if (!isKanban) return;
    apiClient.get(`/projects/${projectId}/throughput`).then((r) => setThroughputData(r.data.data)).catch((err) => { console.error(err); });
    apiClient.get(`/projects/${projectId}/cycle-time`).then((r) => setCycleTimeData(r.data.data)).catch((err) => { console.error(err); });
  }, [projectId, isKanban]);

  useEffect(() => {
    if (isKanban) return;
    if (selectedSprintId && projectId) {
      apiClient.get(`/projects/${projectId}/sprints/${selectedSprintId}/burndown`)
        .then((r) => setBurndownData(r.data.data)).catch((err) => { console.error(err); });
    } else {
      setBurndownData(null);
    }
  }, [selectedSprintId, projectId, isKanban]);

  const tabs = (isKanban
    ? [
        { key: 'flow', label: 'Cumulative Flow' },
        { key: 'throughput', label: 'Throughput' },
        { key: 'cycle', label: 'Cycle Time' },
      ]
    : [
        { key: 'velocity', label: 'Velocity' },
        { key: 'burndown', label: 'Burndown' },
        { key: 'flow', label: 'Cumulative Flow' },
      ]) as { key: 'velocity' | 'burndown' | 'flow' | 'throughput' | 'cycle'; label: string }[];

  return (
    <>
      <PageHeader>
        <p className="text-[11px] tracking-[0.18em] uppercase font-serif font-semibold text-faint mb-1">
          Project · Charts
        </p>
        <h1 className="font-serif text-[36px] text-text">Charts</h1>
      </PageHeader>

      <div className="px-[28px] py-6">
      <div className="flex gap-1 mb-6 border-b border-neutral-200">
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
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[15px] text-mute">
                {!hasSprints
                  ? 'Create your first sprint to start tracking velocity.'
                  : 'Story points completed per sprint will appear here once a sprint is completed.'}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'burndown' && (
        <div>
          <div className="mb-4 max-w-xs">
            <label className="block text-[16px] font-medium text-neutral-600 mb-1">Sprint</label>
            {hasEligibleSprints ? (
              <Select
                value={selectedSprintId}
                onChange={setSelectedSprintId}
                options={eligibleSprints.map((s: any) => ({ value: String(s.id), label: `${s.name}${s.status === 'active' ? ' (active)' : ''}` }))}
              />
            ) : (
              <p className="text-[13px] text-faint">
                {!hasSprints ? 'No sprints created yet.' : 'No active or completed sprints available.'}
              </p>
            )}
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
              <div className="flex flex-col items-center justify-center h-full text-center">
                {sprintsLoaded && (
                  <p className="text-[15px] text-mute">
                    {!hasSprints
                      ? 'Create a sprint and add tasks to see remaining work tracked day by day.'
                      : !hasEligibleSprints
                        ? 'Start or complete a sprint to see remaining story points tracked over its duration.'
                        : 'No burndown data available for this sprint. Add story points to tasks to track progress.'}
                  </p>
                )}
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
              margin={{ top: 20, right: 100, bottom: 60, left: 50 }}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', stacked: true, min: 0 }}
              enableArea={true}
              areaOpacity={0.5}
              colors={['#9BAAB880', '#7B9EBF80', '#C4A88280', '#A78BFA80', '#88B5A880']}
              axisLeft={{ legend: 'Tasks', legendPosition: 'middle', legendOffset: -40 }}
              axisBottom={{
                tickRotation: -30,
                tickValues: (() => {
                  const len = flowData.length;
                  if (len <= 8) return flowData.map((d: any) => d.date);
                  const step = Math.ceil(len / 8);
                  return flowData.filter((_: any, i: number) => i % step === 0 || i === len - 1).map((d: any) => d.date);
                })(),
                format: (value: string) => {
                  const d = new Date(value);
                  if (isNaN(d.getTime())) return value;
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                },
              }}
              legends={[{ anchor: 'bottom-right', direction: 'column', translateX: 90, itemWidth: 70, itemHeight: 20 }]}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[15px] text-mute">
                {!hasSprints
                  ? 'Create sprints and move tasks through statuses to see how work flows over time.'
                  : 'Task counts per status over time will appear here as work moves through your workflow.'}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'throughput' && (
        <div className="h-[400px]">
          {throughputData.length > 0 ? (
            <ResponsiveBar
              data={throughputData.map((d: any) => ({ week: d.week, count: d.count }))}
              keys={['count']}
              indexBy="week"
              margin={{ top: 20, right: 20, bottom: 60, left: 50 }}
              padding={0.3}
              colors={['#5A83A8']}
              axisLeft={{ legend: 'Items Completed', legendPosition: 'middle', legendOffset: -40 }}
              axisBottom={{
                tickRotation: -30,
                format: (value: string) => {
                  const d = new Date(value);
                  if (isNaN(d.getTime())) return value;
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                },
              }}
              enableLabel={true}
              theme={{ text: { fill: '#6B7280' } }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[15px] text-mute">
                The number of items completed each week will appear here as work gets done.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'cycle' && (
        <div className="h-[400px]">
          {cycleTimeData.length > 0 ? (
            <ResponsiveBar
              data={cycleTimeData.map((d: any) => ({ week: d.week, days: d.avgCycleTimeDays, count: d.count }))}
              keys={['days']}
              indexBy="week"
              margin={{ top: 20, right: 20, bottom: 60, left: 50 }}
              padding={0.3}
              colors={['#5A83A8']}
              axisLeft={{ legend: 'Avg Cycle Time (days)', legendPosition: 'middle', legendOffset: -40 }}
              axisBottom={{
                tickRotation: -30,
                format: (value: string) => {
                  const d = new Date(value);
                  if (isNaN(d.getTime())) return value;
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                },
              }}
              enableLabel={true}
              theme={{ text: { fill: '#6B7280' } }}
              tooltip={({ value, data }: any) => (
                <div className="bg-paper border border-neutral-200 px-3 py-2 text-[13px] text-text">
                  <div className="font-medium">{Number(value).toFixed(1)} days avg</div>
                  <div className="text-mute">{data.count} item{data.count === 1 ? '' : 's'} completed</div>
                </div>
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[15px] text-mute">
                The average time items take from start to done each week will appear here.
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </>
  );
}
