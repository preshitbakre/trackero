import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';

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
    } catch {}
  };

  const loadRetro = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}/retro`);
      setRetroId(data.data.id);
      setCards(data.data.cards || []);
    } catch {
      // No retro yet — create one
      try {
        const { data } = await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/retro`);
        setRetroId(data.data.id);
        setCards([]);
      } catch {}
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
    } catch {}
  };

  const handleEditCard = async (cardId: number, content: string) => {
    if (!retroId || !content.trim()) return;
    try {
      await apiClient.put(`/projects/${projectId}/retro/${retroId}/cards/${cardId}`, { content });
      setEditingCard(null);
      loadRetro();
    } catch {}
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!retroId) return;
    try {
      await apiClient.delete(`/projects/${projectId}/retro/${retroId}/cards/${cardId}`);
      loadRetro();
    } catch {}
  };

  const handleVote = async (cardId: number) => {
    if (!retroId) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`);
      loadRetro();
    } catch {}
  };

  const columns = [
    { key: 'went_well', title: 'Went Well', color: 'border-mint bg-mint-light dark:bg-mint-dm/30' },
    { key: 'to_improve', title: 'To Improve', color: 'border-tan bg-tan-light dark:bg-tan-dm/30' },
    { key: 'action_items', title: 'Action Items', color: 'border-peri bg-peri-light dark:bg-peri-dm/30' },
  ];

  return (
    <div className="p-6">
      <Link
        to={`/projects/${projectId}/sprints`}
        className="text-[14px] text-neutral-400 dark:text-dneutral-400 hover:text-neutral-500 dark:hover:text-dneutral-500 mb-3 inline-block"
      >
        &larr; Back to Sprints
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700">Retrospective</h1>
        {sprintName && (
          <span className="text-[16px] text-neutral-400 dark:text-dneutral-500">
            — {sprintName}
          </span>
        )}
        {sprintStatus && (
          <span className={`text-[12px] px-2 py-0.5 rounded-full ${
            sprintStatus === 'active'
              ? 'bg-tan-light text-neutral-600 dark:bg-tan-dm/30 dark:text-tan-dm'
              : sprintStatus === 'completed'
                ? 'bg-mint-light text-neutral-600 dark:bg-mint-dm/30 dark:text-mint-dm'
                : 'bg-neutral-100 text-neutral-500 dark:bg-dneutral-200 dark:text-dneutral-500'
          }`}>
            {sprintStatus}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => {
          const colCards = cards
            .filter((c) => c.column === col.key)
            .sort((a, b) => b.votes - a.votes);

          return (
            <div key={col.key} className={`rounded-lg border-t-4 p-4 ${col.color}`}>
              <h2 className={`font-medium mb-3 ${
                col.key === 'went_well' ? 'text-mint dark:text-mint-dm' :
                col.key === 'to_improve' ? 'text-tan dark:text-tan-dm' :
                'text-peri dark:text-peri-dm'
              }`}>{col.title}</h2>

              <div className="space-y-2 mb-3">
                {colCards.map((card) => (
                  <div key={card.id} className="bg-white dark:bg-dneutral-100 rounded p-3 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:shadow-md dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                    {editingCard?.id === card.id ? (
                      <div>
                        <textarea
                          value={editingCard.content}
                          onChange={(e) => setEditingCard({ ...editingCard, content: e.target.value })}
                          autoFocus
                          rows={3}
                          className="w-full text-[16px] rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 p-2"
                        />
                        <div className="flex gap-1 mt-1">
                          <Button size="sm" onClick={() => handleEditCard(card.id, editingCard.content)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCard(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[16px] text-neutral-600 dark:text-dneutral-600">{card.content}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {canEdit && (
                        <button
                          onClick={() => handleVote(card.id)}
                          className={`text-[16px] flex items-center gap-1 text-neutral-400 hover:text-tan dark:text-dneutral-400 dark:hover:text-tan-dm ${card.votes > 0 ? '!text-tan dark:!text-tan-dm' : ''}`}
                        >
                          👍 {card.votes}
                        </button>
                      )}
                      {!canEdit && (
                        <span className={`text-[16px] flex items-center gap-1 ${card.votes > 0 ? 'text-tan dark:text-tan-dm' : 'text-neutral-400 dark:text-dneutral-400'}`}>
                          👍 {card.votes}
                        </span>
                      )}
                      {canEdit && (
                        <div className="flex gap-1">
                          <button onClick={() => setEditingCard({ id: card.id, content: card.content })} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-400 hover:text-neutral-600" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteCard(card.id)} className="p-1 rounded hover:bg-danger/10 text-neutral-400 hover:text-danger" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {canEdit && (newCard?.column === col.key ? (
                <div className="space-y-2">
                  <textarea
                    value={newCard.content}
                    onChange={(e) => setNewCard({ ...newCard, content: e.target.value })}
                    placeholder="Add a card..."
                    autoFocus
                    rows={3}
                    className="w-full text-[16px] rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 p-2"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleAddCard(col.key)}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => setNewCard(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.key, content: '' })}
                  className="text-[16px] text-neutral-400 hover:text-peri"
                >
                  + Add card
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
