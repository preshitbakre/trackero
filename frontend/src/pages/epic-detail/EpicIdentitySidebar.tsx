import type { EpicDetail } from '../../api/epics';
import { epicStateToPill } from '../../api/epics';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusKey } from '../../components/ui/StatusPill';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] uppercase text-faint">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Settings-tab sidebar — epic identity + audit. */
export function EpicIdentitySidebar({ epic }: { epic: EpicDetail }) {
  return (
    <aside className="w-[240px] shrink-0 border-l border-rule px-5 py-6 flex flex-col gap-5">
      <p className="text-[11px] tracking-[0.14em] uppercase text-faint font-semibold">Epic identity</p>

      <Section label="ID">
        <p className="font-mono text-[15px] text-text">{epic.itemKey}</p>
      </Section>

      <Section label="State">
        <StatusPill status={epicStateToPill(epic.displayState) as StatusKey} />
      </Section>

      <Section label="Audit">
        <p className="text-[13px] text-mute">
          Created {fmtDate(epic.audit.createdOn)}
          {epic.audit.createdBy && ` by @${epic.audit.createdBy.handle}`}
        </p>
        <p className="text-[13px] text-mute">Last edited {relTime(epic.audit.lastEditedAt)}</p>
      </Section>
    </aside>
  );
}
