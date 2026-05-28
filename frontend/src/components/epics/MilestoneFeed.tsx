import { useState } from 'react';
import type { EpicMilestone } from '../../api/epics';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

const KIND_COLOR: Record<string, string> = {
  note: '#6B6377',
  kickoff: '#1A1424',
  shipped: '#3E8E44',
  risk: '#E88A48',
  target: '#7C3AED',
};

const CHIP: Record<string, { bg: string; color: string } | null> = {
  risk: { bg: '#E88A4818', color: '#B5631F' },
  target: { bg: '#7C3AED15', color: '#6326D6' },
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-[20px] text-text">Milestones</h2>
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

      <div className="relative pl-2">
        {milestones.map((m) => {
          const chip = CHIP[m.kind];
          return (
            <div key={`${m.id}-${m.occurredOn}`} className="group flex gap-3 pb-5 last:pb-0">
              <span
                className="w-2.5 h-2.5 mt-1.5 shrink-0"
                style={{ backgroundColor: KIND_COLOR[m.kind] ?? '#6B6377' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {m.author && <Avatar user={m.author} size="xs" />}
                  {m.author && <span className="text-[13px] font-medium text-text">{m.author.displayName}</span>}
                  <span className="text-[12px] text-faint">{fmtDate(m.occurredOn)}</span>
                  {chip && (
                    <span
                      className="text-[10px] uppercase px-1.5 py-0.5 rounded-full"
                      style={{ background: chip.bg, color: chip.color }}
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
                <p className="mt-1 text-[14px] text-text">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
