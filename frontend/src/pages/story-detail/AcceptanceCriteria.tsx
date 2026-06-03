import { useState } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Combobox } from '../../components/ui/Combobox';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { AcceptanceCriterion } from './types';

interface LinkOption {
  id: number;
  itemKey: string;
  title: string;
}

interface Props {
  projectId: number;
  storyId: number;
  criteria: AcceptanceCriterion[];
  met: number;
  total: number;
  canEdit: boolean;
  mode: 'read' | 'edit';
  linkOptions: LinkOption[];
  onChanged: () => void;
  onOpenItem?: (id: number) => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const KW = 'text-[11px] uppercase tracking-[0.08em] font-semibold mr-1.5';

export function AcceptanceCriteria({
  projectId, storyId, criteria, met, total, canEdit, mode, linkOptions, onChanged, onOpenItem,
}: Props) {
  const [adding, setAdding] = useState(false);
  const base = `/projects/${projectId}/items/${storyId}/acceptance-criteria`;

  const toggleMet = async (c: AcceptanceCriterion) => {
    if (!canEdit) return;
    try {
      await apiClient.patch(`${base}/${c.id}`, { isMet: !c.isMet });
      onChanged();
    } catch {
      toast('Failed to update criterion', 'error');
    }
  };

  const remove = async (c: AcceptanceCriterion) => {
    try {
      await apiClient.delete(`${base}/${c.id}`);
      onChanged();
    } catch {
      toast('Failed to delete criterion', 'error');
    }
  };

  const patchText = async (c: AcceptanceCriterion, fields: Record<string, unknown>) => {
    try {
      await apiClient.patch(`${base}/${c.id}`, fields);
      onChanged();
    } catch {
      toast('Failed to save criterion', 'error');
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= criteria.length) return;
    const ids = criteria.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await apiClient.put(`${base}/reorder`, { orderedIds: ids });
      onChanged();
    } catch {
      toast('Failed to reorder', 'error');
    }
  };

  return (
    <div className="bg-card border border-rule">
      <div className="flex items-center justify-between px-4 py-3 bg-paper-2 border-b border-rule">
        <div className="flex items-baseline gap-3">
          <Eyebrow>Acceptance criteria</Eyebrow>
          <span className="font-mono text-[11px] text-faint tracking-normal">· {met} of {total} met</span>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[12px] text-text border border-rule px-2.5 py-0.5 hover:bg-shade transition-colors inline-flex items-center gap-1"
          >
            + add
          </button>
        )}
      </div>
      <div className="p-4">

      <div className="flex flex-col">
        {criteria.map((c, i) => (
          <CriterionRow
            key={c.id}
            c={c}
            canEdit={canEdit}
            mode={mode}
            linkOptions={linkOptions}
            onToggle={() => toggleMet(c)}
            onRemove={() => remove(c)}
            onPatch={(f) => patchText(c, f)}
            onOpenItem={onOpenItem}
            onMoveUp={i > 0 ? () => move(i, -1) : undefined}
            onMoveDown={i < criteria.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
        {criteria.length === 0 && !adding && (
          <p className="text-[13px] text-mute py-2">No acceptance criteria yet.</p>
        )}
      </div>

      {adding && (
        <AddCriterionForm
          onCancel={() => setAdding(false)}
          onSave={async (payload) => {
            try {
              await apiClient.post(base, payload);
              setAdding(false);
              onChanged();
            } catch {
              toast('Failed to add criterion', 'error');
            }
          }}
        />
      )}
      </div>
    </div>
  );
}

function CriterionRow({
  c, canEdit, mode, linkOptions, onToggle, onRemove, onPatch, onOpenItem, onMoveUp, onMoveDown,
}: {
  c: AcceptanceCriterion;
  canEdit: boolean;
  mode: 'read' | 'edit';
  linkOptions: LinkOption[];
  onToggle: () => void;
  onRemove: () => void;
  onPatch: (f: Record<string, unknown>) => void;
  onOpenItem?: (id: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const isEdit = mode === 'edit' && canEdit;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-rule/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit}
        className={`mt-0.5 w-4 h-4 flex-shrink-0 border inline-flex items-center justify-center ${
          c.isMet ? 'bg-[#3E8E44] border-[#3E8E44] text-white' : 'border-rule'
        } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
        aria-label={c.isMet ? 'Mark not met' : 'Mark met'}
      >
        {c.isMet && <span className="text-[10px] leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        {isEdit ? (
          <EditableCriterion c={c} onPatch={onPatch} />
        ) : c.structured ? (
          <div className="text-[14px] leading-[1.5]">
            <div><span className={`${KW} text-[#8C6638]`}>Given</span><span className="text-text">{c.givenText}</span></div>
            <div><span className={`${KW} text-[#3F5E8E]`}>When</span><span className="text-text">{c.whenText}</span></div>
            <div><span className={`${KW} text-[#8E3E88]`}>Then</span><span className="text-text">{c.thenText}</span></div>
          </div>
        ) : (
          <div className="text-[14px] text-text leading-[1.5]">{c.givenText}</div>
        )}

        {/* Footer meta */}
        <div className="mt-1 flex items-center gap-3 text-[12px]">
          {c.isMet && c.verifier && (
            <span className="text-[#3E8E44] inline-flex items-center gap-1">
              ✓ verified by {c.verifier.displayName}
              {c.verifiedAt && <span className="text-faint">· {relativeTime(c.verifiedAt)}</span>}
            </span>
          )}
          {c.linkedItem && (
            <button
              type="button"
              onClick={() => onOpenItem?.(c.linkedItem!.id)}
              className="font-mono text-[11px] text-mute hover:text-lilac-dark"
            >
              {c.linkedItem.itemKey}
              {c.linkedItem.statusName && <span className="text-faint"> · {c.linkedItem.statusName}</span>}
            </button>
          )}
          {isEdit && (
            <LinkPicker
              value={c.linkedItem?.id ?? null}
              options={linkOptions}
              onChange={(id) => onPatch({ linkedItemId: id })}
            />
          )}
        </div>
      </div>

      {isEdit && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className="text-faint hover:text-text disabled:opacity-30 text-[12px]" aria-label="Move up">↑</button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className="text-faint hover:text-text disabled:opacity-30 text-[12px]" aria-label="Move down">↓</button>
          <button type="button" onClick={onRemove} className="text-faint hover:text-danger text-[12px] ml-1">remove</button>
        </div>
      )}
    </div>
  );
}

function EditableCriterion({ c, onPatch }: { c: AcceptanceCriterion; onPatch: (f: Record<string, unknown>) => void }) {
  const [given, setGiven] = useState(c.givenText);
  const [when, setWhen] = useState(c.whenText ?? '');
  const [then, setThen] = useState(c.thenText ?? '');
  const inputCls = '!bg-paper !px-2 !py-1 !text-[13px] mb-1 !rounded-none';

  const commit = () => {
    onPatch({
      givenText: given,
      whenText: when.trim() ? when : null,
      thenText: then.trim() ? then : null,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <span className={`${KW} text-[#8C6638] w-[44px]`}>Given</span>
        <Input type="text" className={inputCls} value={given} onChange={(e) => setGiven(e.target.value)} onBlur={commit} />
      </div>
      <div className="flex items-center gap-1">
        <span className={`${KW} text-[#3F5E8E] w-[44px]`}>When</span>
        <Input type="text" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} onBlur={commit} placeholder="(optional)" />
      </div>
      <div className="flex items-center gap-1">
        <span className={`${KW} text-[#8E3E88] w-[44px]`}>Then</span>
        <Input type="text" className={inputCls} value={then} onChange={(e) => setThen(e.target.value)} onBlur={commit} placeholder="(optional)" />
      </div>
    </div>
  );
}

function LinkPicker({ value, options, onChange }: { value: number | null; options: LinkOption[]; onChange: (id: number | null) => void }) {
  return (
    <Combobox
      value={value ? String(value) : ''}
      onChange={(v) => onChange(v ? parseInt(v) : null)}
      placeholder="link item…"
      options={[{ value: '', label: 'No link' }, ...options.map((o) => ({ value: String(o.id), label: `${o.itemKey} ${o.title}` }))]}
      className="!h-[26px] !text-[12px] max-w-[200px]"
    />
  );
}

function AddCriterionForm({ onSave, onCancel }: { onSave: (p: { givenText: string; whenText?: string; thenText?: string }) => void; onCancel: () => void }) {
  const [given, setGiven] = useState('');
  const [when, setWhen] = useState('');
  const [then, setThen] = useState('');
  const inputCls = '!bg-paper !px-2 !py-1 !text-[13px] mb-1 !rounded-none';

  return (
    <div className="mt-3 pt-3 border-t border-rule">
      <Input type="text" autoFocus className={inputCls} value={given} onChange={(e) => setGiven(e.target.value)} placeholder="Given (or a plain statement)" />
      <Input type="text" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="When (optional)" />
      <Input type="text" className={inputCls} value={then} onChange={(e) => setThen(e.target.value)} placeholder="Then (optional)" />
      <div className="flex gap-2 mt-1">
        <Button
          variant="ink"
          size="sm"
          className="text-[12px]"
          disabled={!given.trim()}
          onClick={() => onSave({ givenText: given.trim(), whenText: when.trim() || undefined, thenText: then.trim() || undefined })}
        >
          Add
        </Button>
        <Button variant="ghost" size="sm" className="text-[12px]" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
