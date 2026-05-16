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

  const handleVote = async (cardId: number) => {
    if (!retroId) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retroId}/cards/${cardId}/vote`);
      loadRetro();
    } catch {}
  };

  const columns = [
    { key: 'went_well', title: 'Went Well', color: 'border-green-400 bg-green-50 dark:bg-green-900/10' },
    { key: 'to_improve', title: 'To Improve', color: 'border-amber-400 bg-amber-50 dark:bg-amber-900/10' },
    { key: 'action_items', title: 'Action Items', color: 'border-blue-400 bg-blue-50 dark:bg-blue-900/10' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">Retrospective</h1>

      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => {
          const colCards = cards
            .filter((c) => c.column === col.key)
            .sort((a, b) => b.votes - a.votes);

          return (
            <div key={col.key} className={`rounded-lg border-t-4 p-4 ${col.color}`}>
              <h2 className="font-medium text-gray-900 dark:text-gray-50 mb-3">{col.title}</h2>

              <div className="space-y-2 mb-3">
                {colCards.map((card) => (
                  <div key={card.id} className="bg-white dark:bg-gray-900 rounded p-3 shadow-sm border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{card.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => handleVote(card.id)}
                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-brand"
                      >
                        👍 {card.votes}
                      </button>
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
                    className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2"
                  />
                  <div className="flex gap-1">
                    <button onClick={() => handleAddCard(col.key)} className="text-xs px-2 py-1 bg-brand text-white rounded">Add</button>
                    <button onClick={() => setNewCard(null)} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewCard({ column: col.key, content: '' })}
                  className="text-xs text-gray-400 hover:text-brand"
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
