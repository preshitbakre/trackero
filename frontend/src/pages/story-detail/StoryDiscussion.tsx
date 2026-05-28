import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { useAuthStore } from '../../store/auth.store';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Avatar } from '../../components/ui/Avatar';
import { CommentBody } from '../../components/ui/CommentBody';
import { MentionTextarea } from '../../components/ui/MentionTextarea';

interface Reaction { emoji: string; count: number; byMe: boolean }
interface Comment {
  id: number;
  body: string;
  createdAt: string;
  author?: { id: number; displayName: string; avatarUrl: string | null };
  reactions?: Reaction[];
}
interface Member { id: number; displayName: string; avatarUrl: string | null }

interface Props {
  projectId: number;
  storyId: number;
  canEdit: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const QUICK_EMOJIS = ['👍', '🎉', '👀'];

export function StoryDiscussion({ projectId, storyId, canEdit }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');

  const base = `/projects/${projectId}/items/${storyId}/comments`;

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(base);
      setComments(data.data.list || data.data || []);
    } catch { /* non-fatal */ }
  }, [base]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiClient.get(`/projects/${projectId}/members`)
      .then((res) => setMembers((res.data.data.list || []).map((m: any) => ({
        id: m.userId ?? m.user?.id ?? m.id,
        displayName: m.user?.displayName ?? m.displayName ?? '',
        avatarUrl: m.user?.avatarUrl ?? m.avatarUrl ?? null,
      }))))
      .catch(() => {});
  }, [projectId]);

  const post = async () => {
    if (!draft.trim()) return;
    try {
      await apiClient.post(base, { body: draft.trim() });
      setDraft('');
      await load();
      setExpanded(true);
    } catch { toast('Failed to post comment', 'error'); }
  };

  const saveEdit = async (id: number) => {
    if (!editBody.trim()) return;
    try {
      await apiClient.put(`${base}/${id}`, { body: editBody.trim() });
      setEditingId(null);
      await load();
    } catch { toast('Failed to edit comment', 'error'); }
  };

  const remove = async (id: number) => {
    try {
      await apiClient.delete(`${base}/${id}`);
      await load();
    } catch { toast('Failed to delete comment', 'error'); }
  };

  const react = async (id: number, emoji: string) => {
    try {
      await apiClient.post(`${base}/${id}/reactions`, { emoji });
      await load();
    } catch { toast('Failed to react', 'error'); }
  };

  const shown = expanded ? comments : comments.slice(0, 2);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>Discussion · {comments.length} comment{comments.length === 1 ? '' : 's'}</Eyebrow>
        {comments.length > 2 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[12px] text-lilac-dark hover:underline">
            {expanded ? 'collapse' : 'open thread →'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {shown.map((c) => {
          const isAuthor = !!currentUser && c.author?.id === currentUser.id;
          return (
            <div key={c.id} className="flex items-start gap-2.5 group">
              <Avatar user={{ id: c.author?.id ?? 0, displayName: c.author?.displayName ?? '?', avatarUrl: c.author?.avatarUrl }} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-text">{c.author?.displayName ?? 'Someone'}</span>
                  <span className="text-[12px] text-faint">{relativeTime(c.createdAt)}</span>
                  {canEdit && isAuthor && editingId !== c.id && (
                    <span className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                      <button type="button" onClick={() => { setEditingId(c.id); setEditBody(c.body); }} className="text-[11px] text-faint hover:text-text">edit</button>
                      <button type="button" onClick={() => remove(c.id)} className="text-[11px] text-faint hover:text-danger">delete</button>
                    </span>
                  )}
                </div>

                {editingId === c.id ? (
                  <div className="mt-1">
                    <MentionTextarea value={editBody} onChange={setEditBody} onSubmit={() => saveEdit(c.id)} members={members} />
                    <div className="flex gap-2 mt-1">
                      <button type="button" className="btn btn-accent text-[12px]" onClick={() => saveEdit(c.id)}>Save</button>
                      <button type="button" className="btn-ghost text-[12px]" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[14px] text-mute mt-0.5"><CommentBody body={c.body} /></div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {(c.reactions ?? []).map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => canEdit && react(c.id, r.emoji)}
                          className={`text-[12px] px-1.5 py-0.5 rounded-full border ${r.byMe ? 'border-lilac bg-lilac-tint' : 'border-rule'}`}
                        >
                          {r.emoji} {r.count}
                        </button>
                      ))}
                      {canEdit && (
                        <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                          {QUICK_EMOJIS.map((e) => (
                            <button key={e} type="button" onClick={() => react(c.id, e)} className="text-[12px] text-faint hover:text-text">{e}</button>
                          ))}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {comments.length === 0 && <p className="text-[13px] text-mute">No comments yet.</p>}
      </div>

      {canEdit && (
        <div className="mt-4">
          <MentionTextarea value={draft} onChange={setDraft} onSubmit={post} members={members} placeholder="Add to the discussion…" />
          <div className="mt-2">
            <button type="button" className="btn btn-accent text-[12px]" disabled={!draft.trim()} onClick={post}>Comment</button>
          </div>
        </div>
      )}
    </div>
  );
}
