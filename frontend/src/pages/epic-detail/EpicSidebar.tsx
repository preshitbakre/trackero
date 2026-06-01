import { useState, useEffect } from 'react';
import type { EpicDetail, EpicRecentRow } from '../../api/epics';
import { getEpicRecent } from '../../api/epics';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { LabelList } from '../../components/ui/LabelBadge';
import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';

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

function describe(a: EpicRecentRow): string {
  // Child events get an item-key prefix ("BST-108 · changed sprint"); the
  // epic's own events read naturally ("wrote the epic brief").
  const ref = !a.isEpic && a.itemKey ? `${a.itemKey} · ` : '';
  if (a.action === 'created') return a.isEpic ? 'created the epic' : `${a.itemKey ?? 'item'} created`;
  if (a.action === 'comment_added') return `${ref}commented`;
  if (a.action === 'attachment_added') return `${ref}added an attachment`;
  switch (a.fieldChanged) {
    case 'end_date':
      return a.isEpic ? `set target to ${fmtVal(a.newValue)}` : `${ref}target ${fmtVal(a.newValue)}`;
    case 'start_date':
      return a.isEpic ? `set start to ${fmtVal(a.newValue)}` : `${ref}start ${fmtVal(a.newValue)}`;
    case 'title':
      return a.isEpic ? 'renamed the epic' : `${ref}renamed`;
    case 'description':
      return a.isEpic ? 'wrote the epic brief' : `${ref}edited`;
    case 'status':
      return a.newValue ? `${ref}${a.newValue.replace(/_/g, ' ')}` : `${ref}changed status`;
    case 'assignee':
      return a.isEpic ? 'changed the lead' : `${ref}reassigned`;
    case 'sprint':
      return `${ref}changed sprint`;
    default:
      return a.isEpic ? 'updated the epic' : `${ref}updated`;
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EpicSidebar({ epic, projectId }: { epic: EpicDetail; projectId: string }) {
  const [activity, setActivity] = useState<EpicRecentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    getEpicRecent(projectId, epic.id, 8)
      .then((rows) => {
        if (!cancelled) setActivity(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, epic.id]);

  return (
    <aside className="w-[320px] shrink-0 border-l border-rule bg-paper-2 px-[22px] py-5 flex flex-col gap-5 overflow-y-auto">
      <Section label="Lead">
        {epic.lead ? (
          <div className="flex items-center gap-2.5">
            <Avatar user={epic.lead} size="md" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-text truncate">{epic.lead.displayName}</p>
              {epic.lead.handle && <p className="text-[10.5px] text-faint truncate">@{epic.lead.handle}</p>}
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
        <div className="flex items-end gap-1.5 text-[10px] tracking-[0.06em] uppercase text-faint">
          <span>Start</span>
          <span>{fmtDate(epic.startDate)}</span>
          <span className="mx-0.5">→</span>
          <span>Target</span>
          <span>{fmtDate(epic.endDate)}</span>
        </div>
      </Section>

      {epic.byType.length > 0 && (
        <Section label="By type">
          <div className="space-y-2">
            {epic.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2.5 text-[12px] text-mute">
                <TypeTag kind={t.type as TypeTagKind} size="sm" />
                <span className="capitalize">{t.type}</span>
                <span className="ml-auto text-[11.5px] text-text tabular-nums">{t.count}</span>
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
                <span className="text-[10px] text-faint shrink-0 w-[32px] pt-0.5 text-right tabular-nums">{relTime(a.createdAt)}</span>
                {a.user ? (
                  <Avatar user={a.user} size="xs" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-rule shrink-0" />
                )}
                <p className="text-[11.5px] text-mute leading-tight min-w-0">{describe(a)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </aside>
  );
}
