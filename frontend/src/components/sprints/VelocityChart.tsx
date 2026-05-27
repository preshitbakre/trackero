import { ResponsiveBar } from '@nivo/bar';

interface VelocitySprint {
  sprintNumber: number;
  completedPoints: number;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
}

interface VelocityChartProps {
  sprints: VelocitySprint[];
  currentSprintNumber?: number;
}

/**
 * Compact bar chart for the SprintsPage velocity panel.
 * Bars per sprint: cancelled = pale, current = accent, others = muted ink.
 * Height 80px, minimal axes, no grid.
 */
export function VelocityChart({ sprints, currentSprintNumber }: VelocityChartProps) {
  const data = sprints.map((s) => ({
    sprint: String(s.sprintNumber),
    value: s.completedPoints,
    color:
      s.status === 'cancelled' ? '#E5DDED' :
      s.sprintNumber === currentSprintNumber ? '#7C3AED' :
      '#7A6F88',
  }));
  return (
    <div style={{ height: 80 }}>
      <ResponsiveBar
        data={data}
        keys={['value']}
        indexBy="sprint"
        margin={{ top: 4, right: 0, bottom: 16, left: 0 }}
        padding={0.4}
        colors={(d: any) => d.data.color}
        axisLeft={null}
        axisBottom={{ tickSize: 0, tickPadding: 4 }}
        enableLabel={false}
        enableGridY={false}
        theme={{ axis: { ticks: { text: { fontSize: 10, fill: '#7A6F88' } } } }}
        tooltip={({ data }: any) => (
          <div className="bg-card border border-rule px-2 py-1 text-[11px] shadow-sm">
            S-{data.sprint}: {data.value} pts
          </div>
        )}
      />
    </div>
  );
}
