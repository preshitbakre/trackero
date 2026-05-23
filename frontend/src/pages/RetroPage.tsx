import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { toast } from '../components/common/Toast';

interface RetroCard {
  id: number;
  column: 'went_well' | 'to_improve' | 'action_items';
  content: string;
  authorId: number;
  votes: number;
  createdAt: string;
}

export function RetroPage() {
  const { id: projectId, sprintId } = useParams();
  const [retroId, setRetroId] = useState<number | null>(null);
  const [cards, setCards] = useState<RetroCard[]>([]);
  const [newCard, setNewCard] = useState<{ column: string; content: string } | null>(null);
  const [editingCard, setEditingCard] = useState<{ id: number; content: string } | null>(null);
  const [sprintName, setSprintName] = useState('');
  const [sprintStatus, setSprintStatus] = useState('');
  const [sprintEnd, setSprintEnd] = useState<string | null>(null);
  const { canEdit } = useRole();

  useEffect(() => {
    loadRetro();
    loadSprint();
  }, [projectId, sprintId]);

  const loadSprint = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}`);
      setSprintName(data.data.name || '');
      setSprintStatus(data.data.status || '');
      setSprintEnd(data.data.endDate || data.data.end_date || null);
    } catch (err) { console.error(err); }
  };

  const loadRetro = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}/retro`);
      setRetroId(data.data.id);
      setCards(data.data.cards || []);
    } catch {
      try {
        const { data } = await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/retro`);
        setRetroId(data.data.id);
        setCards([]);
      } catch (err) { console.error(err); }
    }
  };

  const handleAddCard = async (column: string) => {
    if (!newCard || !newCard.content.trim() || !retroId) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retroId}/cards`, {
        column,
        content: newCard.content,
      });
      setNewCard(null);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add card', 'error');
    }
  };

  const handleEditCard = async (cardId: number, content: string) => {
    if (!retroId || !content.trim()) return;
    try {
      await apiClient.put(`/projects/${projectId}/retro/${retroId}/cards/${cardId}`, { content });
      setEditingCard(null);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update card', 'error');
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!retroId) return;
    try {
      await apiClient.delete(`/projects/${projectId}/retro/${retroId}/cards/${cardId}`);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete card', 'error');
    }
  };

  const handleVote = async (cardId: number) => {
    if (!retroId) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to vote', 'error');
    }
  };

  const columns: { key: RetroCard['column']; eyebrow: string; title: string }[] = [
    { key: 'went_well', eyebrow: 'KEPT', title: 'What worked' },
    { key: 'to_improve', eyebrow: 'DROPPED', title: "What didn't" },
    { key: 'action_items', eyebrow: 'NEXT', title: 'Try next sprint' },
  ];

  const totalCards = cards.length;
  const totalVotes = cards.reduce((s, c) => s + c.votes, 0);
  // "Top vote" — the highest-voted card overall (only if there are votes).
  const topId = totalVotes > 0
    ? [...cards].sort((a, b) => b.votes - a.votes)[0]?.id
    : null;

  const endLabel = (() => {
    if (!sprintEnd) return null;
    const end = new Date(sprintEnd);
    const today = new Date();
    const daysDiff = Math.round((today.getTime() - end.getTime()) / 86_400_000);
    if (daysDiff < 0) return `ENDS IN ${-daysDiff}D`;
    if (daysDiff === 0) return 'ENDS TODAY';
    if (daysDiff === 1) return 'ENDED YESTERDAY';
    return `ENDED ${daysDiff}D AGO`;
  })();

  return (
    <div className="p-6">
      <Link
        to={`/projects/${projectId}/sprints`}
        className="text-[12px] text-mute hover:text-text mb-3 inline-block"
      >
        ← Back to Sprints
      </Link>

      {/* Editorial header */}
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-faint mb-2">
          {sprintName || 'Sprint'}
          {endLabel ? ` · ${endLabel}` : ''}
          {sprintStatus ? ` · ${sprintStatus.replace(/_/g, ' ').toUpperCase()}` : ''}
        </div>
        <h1 className="font-serif text-[36px] leading-tight text-text dark:text-dneutral-700">
          Looking back — <span className="italic">{totalCards} {totalCards === 1 ? 'card' : 'cards'}, {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} cast.</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {columns.map((col) => {
          const colCards = cards
            .filter((c) => c.column === col.key)
            .sort((a, b) => b.votes - a.votes);

          return (
            <div key={col.key} className="rounded-xl bg-card p-4 flex flex-col">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-faint">
                  {col.eyebrow}
                </span>
                <span className="font-serif italic text-[18px] text-text">
                  {col.title}
                </span>
                <span className="ml-auto text-[12px] text-faint">{colCards.length}</span>
              </div>

              <div className="space-y-2 flex-1">
                {colCards.map((card) => {
                  const isTop = card.id === topId && card.votes > 0;
                  return (
                    <div
                      key={card.id}
                      className={`rounded-lg p-3 border ${
                        isTop
                          ? 'border-lilac/40 bg-lilac-tint/40'
                          : 'border-rule bg-paper/60'
                      }`}
                    >
                      {isTop && (
                        <div className="text-[9px] uppercase tracking-[0.18em] font-semibold text-lilac-dark mb-1">
                          Top vote
                        </div>
                      )}
                      {editingCard?.id === card.id ? (
                        <div>
                          <textarea
                            value={editingCard.content}
                            onChange={(e) => setEditingCard({ ...editingCard, content: e.target.value })}
                            autoFocus
                            rows={3}
                            className="w-full text-[14px] rounded border border-rule bg-card p-2 focus:border-lilac focus:outline-none"
                          />
                          <div className="flex gap-1 mt-1">
                            <Button size="sm" onClick={() => handleEditCard(card.id, editingCard.content)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingCard(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[14px] text-text leading-relaxed">{card.content}</p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <button
                          onClick={() => canEdit && handleVote(card.id)}
                          disabled={!canEdit}
                          className={`text-[12px] inline-flex items-center gap-1 px-2 py-1 rounded-md ${
                            card.votes > 0
                              ? 'bg-card border border-rule text-text font-medium'
                              : 'text-mute hover:bg-lilac-tint hover:text-lilac-dark'
                          } ${!canEdit ? 'cursor-default' : ''}`}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 19V6m0 0l-6 6m6-6l6 6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {card.votes}
                        </button>
                        {canEdit && (
                          <div className="flex gap-1">
                            <button onClick={() => setEditingCard({ id: card.id, content: card.content })} className="p-1 rounded text-faint hover:bg-paper hover:text-text" title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => handleDeleteCard(card.id)} className="p-1 rounded text-faint hover:bg-danger/10 hover:text-danger" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {canEdit && (
                <div className="mt-2 pt-2">
                  {newCard?.column === col.key ? (
                    <div className="space-y-2">
                      <textarea
                        value={newCard.content}
                        onChange={(e) => setNewCard({ ...newCard, content: e.target.value })}
                        placeholder="What stood out?"
                        autoFocus
                        rows={3}
                        className="w-full text-[14px] rounded border border-rule bg-card p-2 focus:border-lilac focus:outline-none"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleAddCard(col.key)}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => setNewCard(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewCard({ column: col.key, content: '' })}
                      className="w-full py-2 text-[12px] text-faint hover:text-lilac-dark hover:bg-lilac-tint rounded-md border border-dashed border-rule"
                    >
                      + Add a card · anonymously
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
