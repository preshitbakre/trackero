import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { EpicDetail } from '../../api/epics';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { LabelList } from '../../components/ui/LabelBadge';
import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';

interface ActivityRow {
  id: number;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user?: { id: number; displayName: string; avatarUrl?: string | null } | null;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtVal(v: string | null): string {
  if (!v) return '';
  const asDate = /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v) : null;
  if (asDate && !isNaN(asDate.getTime())) return asDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return v;
}

function describe(a: ActivityRow): string {
  if (a.action === 'created') return 'created the epic';
  if (a.action === 'comment_added') return 'commented';
  if (a.action === 'attachment_added') return 'added an attachment';
  switch (a.fieldChanged) {
    case 'end_date':
      return `set target to ${fmtVal(a.newValue)}`;
    case 'start_date':
      return `set start to ${fmtVal(a.newValue)}`;
    case 'title':
      return 'renamed the epic';
    case 'description':
      return 'wrote the epic brief';
    case 'status':
      return 'changed status';
    case 'assignee':
      return 'changed the lead';
    case 'sprint':
      return 'changed sprint';
    default:
      return 'updated the epic';
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] uppercase text-faint">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EpicSidebar({ epic, projectId }: { epic: EpicDetail; projectId: string }) {
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/projects/${projectId}/items/${epic.id}/activity`, { params: { limit: 8 } })
      .then((res) => {
        if (!cancelled) setActivity(res.data.data.list ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, epic.id]);

  return (
    <aside className="w-[240px] shrink-0 border-l border-rule px-5 py-6 flex flex-col gap-5 overflow-y-auto">
      <Section label="Lead">
        {epic.lead ? (
          <div className="flex items-center gap-2">
            <Avatar user={epic.lead} size="sm" />
            <div className="min-w-0">
              <p className="text-[14px] text-text truncate">{epic.lead.displayName}</p>
              {epic.lead.handle && <p className="text-[12px] text-faint truncate">@{epic.lead.handle}</p>}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-faint">Unassigned</p>
        )}
      </Section>

      <Section label={`Contributors · ${epic.contributors.count}`}>
        {epic.contributors.users.length > 0 ? (
          <AvatarStack users={epic.contributors.users} max={5} />
        ) : (
          <p className="text-[13px] text-faint">None yet</p>
        )}
      </Section>

      <Section label="Dates">
        <div className="flex items-center gap-3 text-[14px] text-text">
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-faint">Start</p>
            <p>{fmtDate(epic.startDate)}</p>
          </div>
          <span className="text-faint">→</span>
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-faint">Target</p>
            <p>{fmtDate(epic.endDate)}</p>
          </div>
        </div>
      </Section>

      {epic.byType.length > 0 && (
        <Section label="By type">
          <div className="space-y-1.5">
            {epic.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-[13px] text-text">
                <TypeTag kind={t.type as TypeTagKind} size="sm" />
                <span className="capitalize">{t.type}</span>
                <span className="ml-auto text-mute">{t.count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {epic.labels.length > 0 && (
        <Section label="Labels">
          <LabelList labels={epic.labels} max={6} />
        </Section>
      )}

      <Section label="Recent">
        {activity.length === 0 ? (
          <p className="text-[13px] text-faint">No recent activity</p>
        ) : (
          <div className="space-y-2.5">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                {a.user ? (
                  <Avatar user={a.user} size="xs" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-rule shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] text-text leading-tight">{describe(a)}</p>
                  <p className="text-[11px] text-faint">{relTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </aside>
  );
}
