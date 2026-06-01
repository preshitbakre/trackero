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
 * Minimal sparkline-style velocity strip for the SprintsPage velocity
 * panel — mirrors the design's tiny bar chart: each sprint is an
 * equal-width column with a vertical bar (height scales with
 * completedPoints) plus a tiny mono label underneath. Current/active
 * sprint = accent purple; cancelled = faded × marker; completed =
 * ink. Caller is expected to pass at most ~7 sprints with the current
 * sprint last (rightmost).
 */
export function VelocityChart({ sprints, currentSprintNumber }: VelocityChartProps) {
  const max = Math.max(1, ...sprints.map((s) => s.completedPoints));
  const trackHeight = 44; // px — leaves room for the label

  return (
    <div className="flex items-end gap-2.5 h-[56px]">
      {sprints.map((s) => {
        const isCurrent = s.sprintNumber === currentSprintNumber;
        const isCancelled = s.status === 'cancelled';
        const barHeight = Math.max(2, Math.round((s.completedPoints / max) * trackHeight));
        return (
          <div
            key={s.sprintNumber}
            className="flex-1 flex flex-col items-stretch min-w-0"
            title={`S-${s.sprintNumber}: ${s.completedPoints} pts${isCancelled ? ' · cancelled' : ''}`}
          >
            <div className="flex-1 flex items-end justify-center" style={{ minHeight: trackHeight }}>
              {isCancelled ? (
                <span className="font-mono text-[13px] text-faint leading-none">×</span>
              ) : (
                <div
                  style={{
                    height: barHeight,
                    backgroundColor: isCurrent ? '#7C3AED' : '#1A1424',
                  }}
                  className="w-full"
                />
              )}
            </div>
            <div
              className={`text-center font-mono text-[10px] tracking-[0.05em] mt-1 ${
                isCurrent ? 'text-lilac font-semibold' : 'text-mute'
              }`}
            >
              {s.sprintNumber}
            </div>
          </div>
        );
      })}
    </div>
  );
}
