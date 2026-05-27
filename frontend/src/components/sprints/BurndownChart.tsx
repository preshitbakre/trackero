import { ResponsiveLine } from '@nivo/line';

interface BurndownPoint {
  date: string;
  actual: number;
  ideal: number;
  scope: number;
}

interface BurndownChartProps {
  dataPoints: BurndownPoint[];
  startDate: string;
  endDate: string;
  totalPoints: number;
  completedPoints: number;
}

/**
 * Sprint burndown line chart with ideal-slope and projection metadata.
 * Used by the Sprint Detail Overview tab. The card container is included
 * so consumers drop this in without extra wrapping.
 */
export function BurndownChart({
  dataPoints,
  startDate,
  endDate,
  totalPoints,
  completedPoints,
}: BurndownChartProps) {
  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  const totalDays = Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
  const idealSlope = (totalPoints / totalDays).toFixed(1);
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - startMs) / 86_400_000));
  const projectedShip = Math.round((completedPoints / elapsedDays) * totalDays);
  const projectedDelta = projectedShip - totalPoints;

  return (
    <div className="bg-card border border-rule p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-serif text-[16px] text-text">Burndown</h3>
        <span className="text-[12px] text-mute">
          {completedPoints}/{totalPoints} pts · ideal slope {idealSlope}/day
        </span>
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveLine
          data={[
            { id: 'Ideal',  data: dataPoints.map((p) => ({ x: p.date, y: p.ideal })) },
            { id: 'Actual', data: dataPoints.map((p) => ({ x: p.date, y: p.actual })) },
          ]}
          colors={['#ADA3BA', '#7C3AED']}
          margin={{ top: 20, right: 24, bottom: 40, left: 32 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: totalPoints }}
          axisLeft={{ tickValues: 4, tickSize: 0, tickPadding: 8 }}
          axisBottom={{ tickSize: 0, tickPadding: 8 }}
          enableGridX={false}
          enableGridY={true}
          gridYValues={4}
          theme={{
            grid: { line: { stroke: '#E5DDED', strokeDasharray: '2 4' } },
            axis: { ticks: { text: { fontSize: 10, fill: '#7A6F88' } } },
          }}
          lineWidth={2}
          enablePoints={false}
          enableSlices="x"
          legends={[]}
        />
      </div>

      <div className="flex items-center gap-4 text-[11px] text-mute mt-2">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-lilac" /> Actual
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 border-t border-dashed border-faint" /> Ideal
        </span>
        <span className="ml-auto">
          Projected to ship <span className="font-semibold text-text">{projectedShip} pts</span>
          {' · '}
          {projectedDelta >= 0 ? '+' : '−'}{Math.abs(projectedDelta)} vs. committed
        </span>
      </div>
    </div>
  );
}
