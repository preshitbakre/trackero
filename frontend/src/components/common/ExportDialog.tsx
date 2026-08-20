import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { toast } from './Toast';

interface Props {
  projectId: number | string;
  onClose: () => void;
}

/**
 * Export the project's tickets to .xlsx. Scope is All, Backlog, or a specific
 * sprint. The chosen sprint's subtasks come along automatically (the backend
 * inherits them from their parent).
 */
export function ExportDialog({ projectId, onClose }: Props) {
  const [sprints, setSprints] = useState<{ id: number; name: string }[]>([]);
  const [scope, setScope] = useState('all'); // 'all' | 'backlog' | `sprint:<id>`
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiClient
      .get(`/projects/${projectId}/sprints?limit=100`)
      .then((r) => setSprints((r.data.data.list || []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, [projectId]);

  const options = [
    { value: 'all', label: 'All tickets' },
    { value: 'backlog', label: 'Backlog (unscheduled)' },
    ...sprints.map((s) => ({ value: `sprint:${s.id}`, label: `Sprint · ${s.name}` })),
  ];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      let params = '';
      if (scope === 'backlog') params = '?backlog=true';
      else if (scope.startsWith('sprint:')) params = `?sprintId=${scope.slice(7)}`;

      const res = await apiClient.get(`/projects/${projectId}/items/export${params}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? match[1] : 'tickets-export.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      toast('Failed to export tickets', 'error');
    }
    setDownloading(false);
  };

  return (
    <Modal open onClose={onClose} titleId="export-dialog-title">
      <h2 id="export-dialog-title" className="text-[20px] font-semibold text-text mb-1">
        Export tickets
      </h2>
      <p className="text-[13px] text-mute mb-4">
        Download an Excel workbook with every ticket, its full parent path, subtasks, and checklist items.
      </p>

      <label className="block text-[12px] font-medium text-mute uppercase tracking-[0.06em] mb-1.5">
        Scope
      </label>
      <Select value={scope} onChange={setScope} options={options} className="w-full mb-6" />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={downloading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Exporting…' : 'Download .xlsx'}
        </Button>
      </div>
    </Modal>
  );
}
