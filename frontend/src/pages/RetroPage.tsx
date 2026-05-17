import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

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

  useEffect(() => {
    loadRetro();
  }, [projectId, sprintId]);

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
    { key: 'went_well', title: 'Went Well', color: 'border-secondary-400 bg-secondary-50 dark:bg-dsecondary-50' },
    { key: 'to_improve', title: 'To Improve', color: 'border-accent-400 bg-accent-50 dark:bg-daccent-50' },
    { key: 'action_items', title: 'Action Items', color: 'border-primary-400 bg-primary-50 dark:bg-dprimary-50' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-neutral-700 dark:text-dneutral-700 mb-6">Retrospective</h1>

      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => {
          const colCards = cards
            .filter((c) => c.column === col.key)
            .sort((a, b) => b.votes - a.votes);

          return (
            <div key={col.key} className={`rounded-lg border-t-4 p-4 ${col.color}`}>
              <h2 className="font-medium text-neutral-700 dark:text-dneutral-700 mb-3">{col.title}</h2>

              <div className="space-y-2 mb-3">
                {colCards.map((card) => (
                  <div key={card.id} className="bg-neutral-50 dark:bg-dneutral-100 rounded p-3 shadow-sm border border-neutral-200 dark:border-dneutral-300">
                    {editingCard?.id === card.id ? (
                      <div>
                        <textarea
                          value={editingCard.content}
                          onChange={(e) => setEditingCard({ ...editingCard, content: e.target.value })}
                          autoFocus
                          rows={3}
                          className="w-full text-sm rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 p-2"
                        />
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => handleEditCard(card.id, editingCard.content)} className="text-sm px-2 py-1 bg-primary-500 text-white rounded">Save</button>
                          <button onClick={() => setEditingCard(null)} className="text-sm px-2 py-1 text-neutral-400">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-600 dark:text-dneutral-600">{card.content}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => handleVote(card.id)}
                        className="text-sm flex items-center gap-1 text-neutral-400 hover:text-primary-500"
                      >
                        👍 {card.votes}
                      </button>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingCard({ id: card.id, content: card.content })} className="text-sm text-neutral-400 hover:text-neutral-500">Edit</button>
                        <button onClick={() => handleDeleteCard(card.id)} className="text-sm text-neutral-400 hover:text-danger">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {newCard?.column === col.key ? (
                <div className="space-y-2">
                  <textarea
                    value={newCard.content}
                    onChange={(e) => setNewCard({ ...newCard, content: e.target.value })}
                    placeholder="Add a card..."
                    autoFocus
                    rows={3}
                    className="w-full text-sm rounded border border-neutral-200 dark:border-dneutral-300 bg-neutral-50 dark:bg-dneutral-200 p-2"
                  />
                  <div className="flex gap-1">
                    <button onClick={() => handleAddCard(col.key)} className="text-sm px-2 py-1 bg-primary-500 text-white rounded">Add</button>
                    <button onClick={() => setNewCard(null)} className="text-sm px-2 py-1 text-neutral-400">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.key, content: '' })}
                  className="text-sm text-neutral-400 hover:text-primary-500"
                >
                  + Add card
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
