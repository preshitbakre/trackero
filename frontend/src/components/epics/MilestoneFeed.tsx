import { useState } from 'react';
import type { EpicMilestone } from '../../api/epics';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

/**
 * Milestone feed — matches `docs/Epics/Epic detail _ timeline.png`.
 *
 * Each row is a two-line block:
 *
 *   ■  (NN) Author Name   MAY 5   risk           ← meta line (auto-height)
 *      One-sentence body about what happened.    ← body line
 *
 * The colored square in the gutter (kind colour) doubles as the
 * scanning anchor; "risk"/"target" chips render only for those kinds.
 */

// Marker square fill colour by kind — taken from the design tokens
// (--c-forest / --accent / --c-mustard / --ink / --c-sky).
const KIND_COLOR: Record<string, string> = {
  note: 'var(--ink-3)',
  kickoff: 'var(--ink)',
  shipped: 'var(--c-forest)',
  risk: 'var(--c-mustard)',
  target: 'var(--accent)',
};

// Chip styling for the two emphasized kinds shown inline in the meta row.
const CHIP: Record<string, { color: string } | null> = {
  risk: { color: 'var(--c-mustard)' },
  target: { color: 'var(--accent-ink)' },
  note: null,
  kickoff: null,
  shipped: null,
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  milestones: EpicMilestone[];
  canEdit: boolean;
  onAdd: (body: { kind: string; body: string; occurredOn: string }) => void;
  onDelete: (id: number) => void;
}

export function MilestoneFeed({ milestones, canEdit, onAdd, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));

  const submit = () => {
    if (!body.trim()) return;
    onAdd({ kind, body: body.trim(), occurredOn });
    setBody('');
    setKind('note');
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-[20px] text-text" style={{ letterSpacing: '-0.02em' }}>
          Milestones
        </h2>
        {canEdit && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            + Add milestone
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-3 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-2">
          <div className="flex gap-2">
            <Select
              value={kind}
              onChange={setKind}
              options={['note', 'risk', 'target', 'shipped', 'kickoff'].map((k) => ({ value: k, label: k }))}
              className="w-[130px]"
            />
            <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened?" rows={2} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Add
            </Button>
          </div>
        </div>
      )}

      {milestones.length === 0 && !adding && (
        <p className="text-[14px] text-faint py-8 text-center">
          No milestones yet. Add key dates, risks, or progress notes to track this epic's journey.
        </p>
      )}

      <ul className="space-y-3">
        {milestones.map((m) => {
          const chip = CHIP[m.kind];
          return (
            <li key={`${m.id}-${m.occurredOn}`} className="group flex gap-3 items-start">
              {/* Kind marker square — fixed column for vertical alignment */}
              <span
                aria-hidden
                className="shrink-0"
                style={{
                  width: 10,
                  height: 10,
                  background: KIND_COLOR[m.kind] ?? 'var(--ink-3)',
                  marginTop: 5,
                }}
              />
              <div className="min-w-0 flex-1">
                {/* Meta row: avatar · name · date · optional chip · delete */}
                <div className="flex items-center gap-2" style={{ minHeight: 20 }}>
                  {m.author ? (
                    <Avatar user={m.author} size="xs" />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-block rounded-full bg-paper-3"
                      style={{ width: 20, height: 20 }}
                    />
                  )}
                  {m.author && (
                    <span
                      className="text-text"
                      style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em', lineHeight: '16px' }}
                    >
                      {m.author.displayName}
                    </span>
                  )}
                  <span
                    className="font-mono uppercase"
                    style={{
                      fontSize: 10.5,
                      letterSpacing: '-0.005em',
                      color: 'var(--ink-3)',
                      lineHeight: '14px',
                    }}
                  >
                    {fmtDate(m.occurredOn)}
                  </span>
                  {chip && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        color: chip.color,
                        lineHeight: '10px',
                      }}
                    >
                      {m.kind}
                    </span>
                  )}
                  {canEdit && !m.synthesized && (
                    <button
                      type="button"
                      onClick={() => onDelete(m.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-[12px] text-faint hover:text-[#E05252]"
                    >
                      delete
                    </button>
                  )}
                </div>
                {/* Body line */}
                <p
                  className="text-text"
                  style={{
                    fontSize: 13,
                    letterSpacing: '-0.005em',
                    lineHeight: '19.5px',
                    marginTop: 2,
                  }}
                >
                  {m.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
