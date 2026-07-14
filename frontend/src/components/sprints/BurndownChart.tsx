import { ResponsiveLine } from '@nivo/line';

const LINE_COLORS: Record<string, string> = {
  Ideal: '#ADA3BA',
  Actual: '#1A1424',
  Projection: '#7C3AED',
  Scope: '#C4A882',
};

/**
 * Custom line layer: renders Actual and Scope as step lines (they change on
 * discrete days) and Ideal / Projection as straight dashed lines. nivo applies
 * one curve/style to all series, so we draw the paths ourselves from each
 * point's pixel position.
 */
function BurndownLines({ series }: any) {
  return (
    <g>
      {series.map((s: any) => {
        const pts: Array<{ x: number; y: number }> = s.data
          .map((d: any) => d.position)
          .filter((p: any) => p.x != null && p.y != null);
        if (pts.length === 0) return null;
        const color = LINE_COLORS[s.id] ?? '#ADA3BA';

        if (s.id === 'Actual' || s.id === 'Scope') {
          let d = `M ${pts[0].x},${pts[0].y}`;
          for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x},${pts[i - 1].y} L ${pts[i].x},${pts[i].y}`;
          }
          return (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={s.id === 'Scope' ? 1.5 : 2}
              strokeDasharray={s.id === 'Scope' ? '2 4' : undefined}
            />
          );
        }

        const d = `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}`;
        return (
          <path
            key={s.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={s.id === 'Ideal' ? '4 4' : '6 4'}
          />
        );
      })}
    </g>
  );
}

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

  // Today (local YYYY-MM-DD) — used to split Actual / Projection and mark the guide.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayPoint = dataPoints.find((p) => p.date === today);
  const lastPoint = dataPoints[dataPoints.length - 1];
  const projectedRemaining = Math.max(0, totalPoints - projectedShip);

  // Scope (total committed points) only earns a line when it actually moved —
  // a flat scope adds noise, but a rising one explains a rising Actual.
  const scopeMoved = dataPoints.some((p) => p.scope !== dataPoints[0]?.scope);

  // Actual remaining, one point per elapsed day. Short sprints (start == today,
  // e.g. a sprint opened and shipped the same day) yield a single snapshot, so
  // the step line has nothing to connect and disappears. In that case, anchor
  // the line from the start (full committed scope) to the sprint end (current
  // remaining) so the burndown still renders. Multi-day sprints are unaffected.
  let actualData = dataPoints.filter((p) => p.date <= today).map((p) => ({ x: p.date, y: p.actual }));
  if (actualData.length < 2 && lastPoint && lastPoint.date !== dataPoints[0].date) {
    actualData = [
      { x: dataPoints[0].date, y: totalPoints },
      { x: lastPoint.date, y: Math.max(0, totalPoints - completedPoints) },
    ];
  }

  const series: Array<{ id: string; data: Array<{ x: string; y: number }> }> = [
    { id: 'Ideal', data: dataPoints.map((p) => ({ x: p.date, y: p.ideal })) },
    { id: 'Actual', data: actualData },
  ];
  if (scopeMoved) {
    series.push({ id: 'Scope', data: dataPoints.map((p) => ({ x: p.date, y: p.scope })) });
  }
  if (todayPoint && lastPoint && todayPoint.date !== lastPoint.date) {
    series.push({
      id: 'Projection',
      data: [
        { x: todayPoint.date, y: todayPoint.actual },
        { x: lastPoint.date, y: projectedRemaining },
      ],
    });
  }

  const fmtAxis = (v: string) =>
    new Date(v + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

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
          data={series}
          colors={['#ADA3BA', '#1A1424', '#7C3AED']}
          margin={{ top: 20, right: 24, bottom: 40, left: 32 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: totalPoints }}
          axisLeft={{ tickValues: 4, tickSize: 0, tickPadding: 8 }}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            tickValues: lastPoint ? [dataPoints[0].date, lastPoint.date] : undefined,
            format: (v) => fmtAxis(String(v)),
          }}
          enableGridX={false}
          enableGridY={true}
          gridYValues={4}
          layers={['grid', 'markers', 'axes', BurndownLines, 'slices']}
          markers={
            todayPoint
              ? [{
                  axis: 'x',
                  value: todayPoint.date,
                  lineStyle: { stroke: '#7C3AED', strokeWidth: 1, strokeDasharray: '2 3' },
                }]
              : []
          }
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
          <span className="inline-block w-3 h-0.5 bg-ink" /> Actual
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 border-t border-dashed border-faint" /> Ideal
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 border-t border-dashed border-lilac" /> Projection
        </span>
        {scopeMoved && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 border-t border-dashed" style={{ borderColor: '#C4A882' }} /> Scope
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-lilac" /> Today
        </span>
        <span className="ml-auto text-mint-dark font-medium">
          Projected to ship <span className="font-semibold">{projectedShip} pts</span>
          {' · '}
          {projectedDelta >= 0 ? '+' : '−'}{Math.abs(projectedDelta)} vs. committed
        </span>
      </div>
    </div>
  );
}
