import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';

interface Label {
  id: number;
  name: string;
  color: string;
}

interface LabelPickerProps {
  projectId: number;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

export function LabelPicker({ projectId, selectedIds, onChange }: LabelPickerProps) {
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    apiClient.get(`/projects/${projectId}/labels`)
      .then((res) => setLabels(res.data.data?.list || res.data.data || []))
      .catch((err) => { console.error(err); });
  }, [projectId]);

  if (labels.length === 0) return null;

  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => {
        const selected = selectedIds.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={`px-2 py-0.5 rounded-full text-[12px] font-medium transition-all border ${
              selected ? 'ring-1 ring-offset-1' : 'opacity-50 hover:opacity-80'
            }`}
            style={{
              backgroundColor: `${l.color}20`,
              color: l.color,
              borderColor: selected ? l.color : 'transparent',
            }}
          >
            {l.name}
          </button>
        );
      })}
    </div>
  );
}
