import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Eyebrow } from '../ui';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { toast } from '../common/Toast';

/**
 * Phase 9 frontend — list configured outbound integrations + add / edit /
 * delete. The backend already exposes the full CRUD + delivery history;
 * this tab is the minimal UI to drive it (Slack / generic webhook /
 * GitHub). Delivery audit + retry UI is a follow-up.
 */

type IntegrationType = 'webhook' | 'slack' | 'github';

interface IntegrationRow {
  id: number | string;
  type: IntegrationType;
  config: { url?: string; bearerToken?: string; [k: string]: unknown };
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface NewIntegrationState {
  type: IntegrationType;
  url: string;
}

export function IntegrationsTab({ projectId }: { projectId: number }) {
  const [list, setList] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<NewIntegrationState>({ type: 'webhook', url: '' });
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/projects/${projectId}/integrations`);
      setList(res.data.data.integrations ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleCreate = async () => {
    if (!draft.url.trim()) {
      toast('URL is required.', 'error');
      return;
    }
    try {
      const res = await apiClient.post(`/projects/${projectId}/integrations`, {
        type: draft.type,
        config: { url: draft.url.trim() },
        enabled: true,
      });
      // The backend returns the HMAC secret exactly once on creation.
      // Surface it to the operator so they can paste it into the receiver.
      setCreatedSecret(res.data.data.secret ?? null);
      setDraft({ type: 'webhook', url: '' });
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Could not create integration.', 'error');
    }
  };

  const toggleEnabled = async (id: number | string, next: boolean) => {
    try {
      await apiClient.put(`/projects/${projectId}/integrations/${id}`, { enabled: next });
      load();
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Could not update integration.', 'error');
    }
  };

  const remove = async (id: number | string) => {
    if (!confirm('Delete this integration? Pending deliveries are dropped.')) return;
    try {
      await apiClient.delete(`/projects/${projectId}/integrations/${id}`);
      load();
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Could not delete integration.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif italic text-[28px] text-ink">Integrations</h2>
          <p className="text-mute mt-1 text-[14px]">
            Outbound webhooks for work items, comments, sprints. HMAC-signed.
          </p>
        </div>
        {!showCreate && (
          <Button onClick={() => setShowCreate(true)}>+ Add integration</Button>
        )}
      </div>

      {createdSecret && (
        <div className="rounded-lg border border-lilac/30 bg-lilac-tint/30 p-4">
          <Eyebrow>Save this secret now</Eyebrow>
          <p className="text-[13px] text-text mt-1.5">
            It won't be shown again. Add it to your receiver as the HMAC key
            used to verify the <code className="font-mono">X-Trackero-Signature</code> header.
          </p>
          <code className="block mt-2 px-3 py-2 rounded bg-card font-mono text-[12px] break-all border border-rule">
            {createdSecret}
          </code>
          <button
            type="button"
            className="mt-2 text-[12px] text-lilac-dark hover:underline"
            onClick={() => setCreatedSecret(null)}
          >
            I've saved it · dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border border-rule bg-card p-4 space-y-3">
          <Eyebrow>New integration</Eyebrow>
          <div className="flex items-center gap-2">
            <Select
              value={draft.type}
              onChange={(v) => setDraft((d) => ({ ...d, type: v as IntegrationType }))}
              options={[
                { value: 'webhook', label: 'Generic webhook' },
                { value: 'slack', label: 'Slack incoming webhook' },
                { value: 'github', label: 'GitHub repo dispatch' },
              ]}
            />
            <Input
              type="text"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://example.com/webhook"
              className="!flex-1 !text-[13px] !rounded-md !bg-paper"
            />
            <Button onClick={handleCreate}>Add</Button>
            <Button variant="ghost" onClick={() => { setShowCreate(false); setDraft({ type: 'webhook', url: '' }); }}>Cancel</Button>
          </div>
          <p className="text-[12px] text-mute italic">
            Trackero signs every delivery with HMAC-SHA256. A secret is returned
            once after you save — paste it into your receiver to verify
            authenticity. Failed deliveries retry at 1m / 5m / 15m / 1h / 6h.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-mute italic text-[13px]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-mute italic text-[14px] py-8 text-center">
          No integrations configured yet.
        </p>
      ) : (
        <div className="rounded-lg border border-rule bg-card divide-y divide-rule">
          {list.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3">
              <Eyebrow>{it.type}</Eyebrow>
              <span className="flex-1 min-w-0 text-[13px] font-mono truncate text-mute">
                {it.config?.url ?? '(no URL)'}
              </span>
              <button
                type="button"
                onClick={() => toggleEnabled(it.id, !it.enabled)}
                className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold transition-colors ${
                  it.enabled ? 'bg-mint-light text-mint-dark' : 'bg-paper text-mute'
                }`}
              >
                {it.enabled ? 'enabled' : 'paused'}
              </button>
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="text-faint hover:text-priority-urgent text-[12px]"
                aria-label="Delete integration"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
