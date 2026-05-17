import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { toast } from '../common/Toast';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

interface ProjectData {
  id: number;
  name: string;
  prefix: string;
  description: string | null;
  leadId: number | null;
  defaultAssigneeId: number | null;
  defaultSprintDuration: number;
  estimationScale: 'free' | 'fibonacci' | 'tshirt';
}

interface Member {
  userId: number;
  user: { id: number; displayName: string; avatarUrl: string | null };
}

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
const TSHIRT = [
  { label: 'XS', value: 1 },
  { label: 'S', value: 2 },
  { label: 'M', value: 3 },
  { label: 'L', value: 5 },
  { label: 'XL', value: 8 },
];

export function GeneralTab({ canEdit }: { canEdit: boolean }) {
  const { id: projectId } = useParams();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState('');
  const [defaultAssigneeId, setDefaultAssigneeId] = useState('');
  const [sprintDuration, setSprintDuration] = useState('14');
  const [estimationScale, setEstimationScale] = useState<'free' | 'fibonacci' | 'tshirt'>('free');

  // Track original values for dirty check
  const [original, setOriginal] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      apiClient.get(`/projects/${projectId}`),
      apiClient.get(`/projects/${projectId}/members`),
    ]).then(([projRes, membersRes]) => {
      const p = projRes.data.data;
      setProject(p);
      setMembers(membersRes.data.data.list || []);

      const vals = {
        name: p.name,
        description: p.description || '',
        leadId: p.leadId ? String(p.leadId) : '',
        defaultAssigneeId: p.defaultAssigneeId ? String(p.defaultAssigneeId) : '',
        sprintDuration: String(p.defaultSprintDuration),
        estimationScale: p.estimationScale || 'free',
      };
      setName(vals.name);
      setDescription(vals.description);
      setLeadId(vals.leadId);
      setDefaultAssigneeId(vals.defaultAssigneeId);
      setSprintDuration(vals.sprintDuration);
      setEstimationScale(vals.estimationScale);
      setOriginal(vals);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  const isDirty =
    name !== original.name ||
    description !== original.description ||
    leadId !== original.leadId ||
    defaultAssigneeId !== original.defaultAssigneeId ||
    sprintDuration !== original.sprintDuration ||
    estimationScale !== original.estimationScale;

  const handleSave = async () => {
    if (!projectId || !isDirty) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (name !== original.name) body.name = name;
      if (description !== original.description) body.description = description || null;
      if (leadId !== original.leadId) body.leadId = leadId ? parseInt(leadId) : null;
      if (defaultAssigneeId !== original.defaultAssigneeId) body.defaultAssigneeId = defaultAssigneeId ? parseInt(defaultAssigneeId) : null;
      if (sprintDuration !== original.sprintDuration) body.defaultSprintDuration = parseInt(sprintDuration);
      if (estimationScale !== original.estimationScale) body.estimationScale = estimationScale;

      await apiClient.put(`/projects/${projectId}`, body);

      // Update original to match saved state
      setOriginal({ name, description, leadId, defaultAssigneeId, sprintDuration, estimationScale });
      toast('Settings saved');
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to save', 'error');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-neutral-200 dark:bg-dneutral-200 rounded" />
        ))}
      </div>
    );
  }

  if (!project) return null;

  const memberOptions = [
    { value: '', label: 'None' },
    ...members.map((m) => ({ value: String(m.user.id), label: m.user.displayName })),
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Project Details */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700 mb-4">Project details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Project name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} required maxLength={255} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} rows={4} maxLength={2000} placeholder="What is this project about?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">
              Project prefix
              <span className="ml-2 text-neutral-400 dark:text-dneutral-500 font-normal">Cannot be changed after creation</span>
            </label>
            <div className="relative">
              <Input value={project.prefix} disabled className="!bg-neutral-100 dark:!bg-dneutral-300 !cursor-not-allowed pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">&#x1F512;</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Project lead</label>
              <Select value={leadId} onChange={setLeadId} options={memberOptions} placeholder="None" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Default assignee</label>
              <Select value={defaultAssigneeId} onChange={setDefaultAssigneeId} options={memberOptions} placeholder="None" className="w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Sprint Defaults */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700 mb-4">Sprint defaults</h2>
        <div>
          <label className="block text-sm font-medium text-neutral-500 dark:text-dneutral-500 mb-1">Default sprint duration (days)</label>
          <Input
            inputMode="numeric"
            value={sprintDuration}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d+$/.test(v)) setSprintDuration(v);
            }}
            onBlur={() => {
              const n = parseInt(sprintDuration) || 14;
              setSprintDuration(String(Math.max(1, Math.min(90, n))));
            }}
            disabled={!canEdit}
            className="!w-24"
          />
          <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-1">New sprints will use this duration (1-90 days)</p>
        </div>
      </section>

      {/* Estimation Settings */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-dneutral-700 mb-4">Estimation scale</h2>
        <div className="space-y-4">
          {/* Free integer */}
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            estimationScale === 'free' ? 'border-primary-500 bg-primary-50 dark:bg-dprimary-50' : 'border-neutral-200 dark:border-dneutral-200'
          }`}>
            <input type="radio" name="estimation" value="free" checked={estimationScale === 'free'} onChange={() => canEdit && setEstimationScale('free')} disabled={!canEdit} className="mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-dneutral-700">Free integer</span>
              <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-0.5">Any whole number. Team chooses their own scale.</p>
              {estimationScale === 'free' && (
                <div className="mt-2">
                  <input type="text" value="5" disabled className="w-16 rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-100 dark:bg-dneutral-200 px-2 py-1 text-sm text-center text-neutral-700 dark:text-dneutral-700" />
                </div>
              )}
            </div>
          </label>

          {/* Fibonacci */}
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            estimationScale === 'fibonacci' ? 'border-primary-500 bg-primary-50 dark:bg-dprimary-50' : 'border-neutral-200 dark:border-dneutral-200'
          }`}>
            <input type="radio" name="estimation" value="fibonacci" checked={estimationScale === 'fibonacci'} onChange={() => canEdit && setEstimationScale('fibonacci')} disabled={!canEdit} className="mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-dneutral-700">Fibonacci sequence</span>
              <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-0.5">1, 2, 3, 5, 8, 13, 21. Industry standard for relative sizing.</p>
              {estimationScale === 'fibonacci' && (
                <div className="flex gap-1 mt-2">
                  {FIBONACCI.map((n) => (
                    <span key={n} className="px-2.5 py-1 text-sm rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-100 dark:bg-dneutral-200 text-neutral-700 dark:text-dneutral-700">{n}</span>
                  ))}
                </div>
              )}
            </div>
          </label>

          {/* T-shirt */}
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            estimationScale === 'tshirt' ? 'border-primary-500 bg-primary-50 dark:bg-dprimary-50' : 'border-neutral-200 dark:border-dneutral-200'
          }`}>
            <input type="radio" name="estimation" value="tshirt" checked={estimationScale === 'tshirt'} onChange={() => canEdit && setEstimationScale('tshirt')} disabled={!canEdit} className="mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-dneutral-700">T-shirt sizes</span>
              <p className="text-sm text-neutral-400 dark:text-dneutral-500 mt-0.5">XS=1, S=2, M=3, L=5, XL=8. Friendly for non-technical teams.</p>
              {estimationScale === 'tshirt' && (
                <div className="flex gap-1 mt-2">
                  {TSHIRT.map((t) => (
                    <span key={t.label} className="px-2.5 py-1 text-sm rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-100 dark:bg-dneutral-200 text-neutral-700 dark:text-dneutral-700">{t.label}</span>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>
      </section>

      {/* Save button */}
      {canEdit && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
