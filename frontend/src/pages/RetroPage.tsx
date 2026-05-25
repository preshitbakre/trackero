import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { Button } from '../components/ui/Button';
import { toast } from '../components/common/Toast';

// Phase 6 — UI vocabulary is the new four-column set. Storage may still
// return the legacy three values; renderRow() maps either way.
type ColumnKey = 'kept' | 'dropped' | 'lucky_breaks' | 'next';
type StoredColumn = ColumnKey | 'went_well' | 'to_improve' | 'action_items';

const LEGACY_TO_NEW: Record<string, ColumnKey> = {
  went_well: 'kept',
  to_improve: 'dropped',
  action_items: 'next',
};

interface RetroCard {
  id: number;
  column: StoredColumn;
  content: string;
  authorId: number | null;
  votes: number;
  isActionItem: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface RetroPayload {
  id: number;
  createdBy: number | null;
  facilitatorId: number | null;
  openedAt: string | null;
  closedAt: string | null;
  authorsRevealedAt: string | null;
  maxVotesPerUser: number;
  uniqueVoters: number;
  currentUserVotesUsed: number;
  cards: RetroCard[];
}

const COLUMNS: {
  key: ColumnKey;
  eyebrow: string;
  title: string;
  eyebrowColor: string;
}[] = [
  { key: 'kept', eyebrow: 'KEPT', title: 'What worked', eyebrowColor: '#1F5236' },
  { key: 'dropped', eyebrow: 'DROPPED', title: "What didn't", eyebrowColor: '#7C3AED' },
  { key: 'lucky_breaks', eyebrow: 'SHIPPED', title: 'Lucky breaks', eyebrowColor: '#C68F12' },
  { key: 'next', eyebrow: 'NEXT', title: 'Try next sprint', eyebrowColor: '#1F5A8A' },
];

export function RetroPage() {
  const { id: projectId, sprintId } = useParams();
  const [retro, setRetro] = useState<RetroPayload | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; displayName: string }>>([]);
  const [newCard, setNewCard] = useState<{ column: ColumnKey; content: string } | null>(null);
  const [editingCard, setEditingCard] = useState<{ id: number; content: string } | null>(null);
  const [sprintName, setSprintName] = useState('');
  const [, setSprintStatus] = useState('');
  const [sprintEnd, setSprintEnd] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const { canEdit, canManageProject } = useRole();

  useEffect(() => {
    loadRetro();
    loadSprint();
    loadMembers();
  }, [projectId, sprintId]);

  const loadSprint = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}`);
      setSprintName(data.data.name || '');
      setSprintStatus(data.data.status || '');
      setSprintEnd(data.data.endDate || data.data.end_date || null);
    } catch (err) { console.error(err); }
  };

  const loadMembers = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/members`);
      setMembers((data.data?.list ?? data.data ?? []).map((m: any) => ({
        id: m.userId ?? m.user?.id ?? m.id,
        displayName: m.user?.displayName ?? m.displayName ?? '—',
      })));
    } catch {
      setMembers([]);
    }
  };

  const loadRetro = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/sprints/${sprintId}/retro`);
      setRetro(data.data as RetroPayload);
    } catch {
      try {
        const { data } = await apiClient.post(`/projects/${projectId}/sprints/${sprintId}/retro`);
        setRetro({ ...data.data, cards: [] });
      } catch (err) { console.error(err); }
    }
  };

  const handleAddCard = async (column: ColumnKey) => {
    if (!newCard || !newCard.content.trim() || !retro) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retro.id}/cards`, {
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
    if (!retro || !content.trim()) return;
    try {
      await apiClient.put(`/projects/${projectId}/retro/${retro.id}/cards/${cardId}`, { content });
      setEditingCard(null);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update card', 'error');
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!retro) return;
    try {
      await apiClient.delete(`/projects/${projectId}/retro/${retro.id}/cards/${cardId}`);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to delete card', 'error');
    }
  };

  const handleVote = async (cardId: number) => {
    if (!retro) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retro.id}/cards/${cardId}/vote`);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to vote', 'error');
    }
  };

  const handleReveal = async () => {
    if (!retro) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retro.id}/reveal-authors`);
      toast('Authors revealed.', 'success');
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Could not reveal authors', 'error');
    }
  };

  const handleClose = async () => {
    if (!retro) return;
    try {
      await apiClient.post(`/projects/${projectId}/retro/${retro.id}/close`);
      toast('Retro closed.', 'success');
      setConfirmClose(false);
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Could not close retro', 'error');
    }
  };

  const handleToggleActionItem = async (cardId: number, current: boolean) => {
    if (!retro) return;
    try {
      await apiClient.put(`/projects/${projectId}/retro/${retro.id}/cards/${cardId}`, {
        isActionItem: !current,
      });
      loadRetro();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to update card', 'error');
    }
  };

  const cards = retro?.cards ?? [];

  const totalCards = cards.length;
  const totalVotes = cards.reduce((s, c) => s + c.votes, 0);
  const uniqueVoters = retro?.uniqueVoters ?? 0;
  const votesRemaining = Math.max(0, (retro?.maxVotesPerUser ?? 0) - (retro?.currentUserVotesUsed ?? 0));
  const isClosed = !!retro?.closedAt;
  const isRevealed = !!retro?.authorsRevealedAt;
  const canEditNow = canEdit && !isClosed;

  // Global top-vote: only the single highest-voted card(s) across ALL columns.
  const topCardIds = useMemo(() => {
    const withVotes = cards.filter((c) => c.votes > 0);
    if (withVotes.length === 0) return new Set<number>();
    const maxVotes = Math.max(...withVotes.map((c) => c.votes));
    return new Set(withVotes.filter((c) => c.votes === maxVotes).map((c) => c.id));
  }, [cards]);

  const memberLookup = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of members) m.set(u.id, u.displayName);
    return m;
  }, [members]);

  const facilitatorName = retro?.facilitatorId
    ? memberLookup.get(retro.facilitatorId) ?? `User ${retro.facilitatorId}`
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
        &larr; Back to Sprints
      </Link>

      {/* Editorial header */}
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          {/* Eyebrow line */}
          <div
            className="font-semibold text-mute mb-2"
            style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}
          >
            {sprintName || 'Sprint'}
            {endLabel ? ` · ${endLabel}` : ''}
            {facilitatorName ? ` · facilitated by ${facilitatorName}` : ''}
          </div>

          {/* Title + subtitle */}
          <h1 className="flex items-baseline gap-3">
            <span
              className="font-serif text-text"
              style={{ fontSize: 36 }}
            >
              Looking back &mdash;
            </span>
            <span
              className="font-serif italic"
              style={{ fontSize: 24, letterSpacing: '-0.24px', color: '#443458' }}
            >
              {totalCards} {totalCards === 1 ? 'card' : 'cards'},{' '}
              {uniqueVoters} {uniqueVoters === 1 ? 'voter' : 'voters'},{' '}
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} cast.
            </span>
          </h1>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Voting status indicator */}
          {retro && (
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#443458' }}>
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  backgroundColor: isClosed ? '#7A6F88' : '#1F5236',
                }}
              />
              {isClosed ? (
                <span>
                  Voting <span className="font-semibold">closed</span>
                </span>
              ) : (
                <span>
                  Voting <span className="font-semibold">open</span> &middot;{' '}
                  {votesRemaining} {votesRemaining === 1 ? 'vote' : 'votes'} left
                </span>
              )}
            </div>
          )}

          {canManageProject && retro && !isClosed && (
            <>
              {!isRevealed && (
                <button
                  onClick={handleReveal}
                  className="inline-flex items-center justify-center rounded"
                  style={{
                    border: '1px solid #E5DDED',
                    backgroundColor: 'transparent',
                    color: '#1A1424',
                    fontSize: 12.5,
                    fontWeight: 500,
                    height: 30,
                    paddingLeft: 12,
                    paddingRight: 12,
                    letterSpacing: '0.125px',
                    whiteSpace: 'nowrap',
                    borderRadius: 4,
                  }}
                >
                  Reveal authors
                </button>
              )}
              <button
                onClick={() => setConfirmClose(true)}
                className="inline-flex items-center justify-center rounded"
                style={{
                  backgroundColor: '#1A1424',
                  color: '#FAF8FD',
                  fontSize: 12.5,
                  fontWeight: 500,
                  height: 30,
                  paddingLeft: 12,
                  paddingRight: 12,
                  letterSpacing: '0.125px',
                  whiteSpace: 'nowrap',
                  borderRadius: 4,
                }}
              >
                Close retro
              </button>
            </>
          )}
        </div>
      </div>

      {/* Four-column grid */}
      <div
        className="grid grid-cols-4 rounded"
        style={{ backgroundColor: '#F1ECF7', gap: 2, padding: 16 }}
      >
        {COLUMNS.map((col, colIdx) => {
          const colCards = cards
            .filter((c) => (LEGACY_TO_NEW[c.column] ?? c.column) === col.key)
            .sort((a, b) => b.votes - a.votes);

          const isFirst = colIdx === 0;
          const isLast = colIdx === COLUMNS.length - 1;
          const cornerClass = isFirst
            ? 'rounded-l'
            : isLast
              ? 'rounded-r'
              : '';

          return (
            <div
              key={col.key}
              className={`flex flex-col ${cornerClass}`}
              style={{ backgroundColor: '#FAF8FD' }}
            >
              {/* Column header */}
              <div
                className="flex items-baseline"
                style={{ gap: 8, padding: 12, minHeight: 51 }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: 600,
                    color: col.eyebrowColor,
                  }}
                >
                  {col.eyebrow}
                </span>
                <span
                  className="font-serif text-text"
                  style={{ fontSize: 20 }}
                >
                  {col.title}
                </span>
                <span
                  className="font-mono text-mute ml-auto"
                  style={{ fontSize: 11 }}
                >
                  {colCards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col flex-1" style={{ gap: 9, padding: 12, paddingTop: 0 }}>
                {colCards.map((card) => {
                  const isTop = topCardIds.has(card.id);
                  const authorLabel = card.authorId
                    ? memberLookup.get(card.authorId) ?? `User ${card.authorId}`
                    : null;

                  return (
                    <div
                      key={card.id}
                      className="group relative lift-on-hover"
                      style={{
                        backgroundColor: isTop ? '#FFF6E6' : '#FFFFFF',
                        padding: '12px 12px 10px',
                        border: isTop ? '1px solid #C68F12' : '1px solid #E5DDED',
                      }}
                    >
                      {/* Top vote badge — floats 50% above the card, 10px inset from right */}
                      {isTop && (
                        <div
                          className="absolute"
                          style={{
                            top: -10,
                            right: 10,
                            backgroundColor: '#C68F12',
                            color: '#FFFFFF',
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.72px',
                            padding: '2px 6px',
                            lineHeight: '16px',
                          }}
                        >
                          TOP VOTE
                        </div>
                      )}

                      {/* Card content */}
                      {editingCard?.id === card.id ? (
                        <div>
                          <textarea
                            value={editingCard.content}
                            onChange={(e) =>
                              setEditingCard({ ...editingCard, content: e.target.value })
                            }
                            autoFocus
                            rows={3}
                            className="w-full rounded border border-rule bg-card p-2 focus:border-lilac focus:outline-none"
                            style={{ fontSize: 13 }}
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="sm"
                              onClick={() => handleEditCard(card.id, editingCard.content)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingCard(null)}
                            >
                              Cancel
                            </Button>
                            {canEditNow && (
                              <button
                                onClick={() =>
                                  handleToggleActionItem(card.id, !!card.isActionItem)
                                }
                                className="ml-auto"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: card.isActionItem ? '#3A1078' : '#7A6F88',
                                  backgroundColor: card.isActionItem ? '#ECE0FA' : 'transparent',
                                  height: 22,
                                  paddingLeft: 8,
                                  paddingRight: 8,
                                  borderRadius: 2,
                                }}
                                title={
                                  card.isActionItem
                                    ? 'Remove action item'
                                    : 'Mark as action item'
                                }
                              >
                                {card.isActionItem ? 'remove action item' : '+ action item'}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-ink"
                          style={{
                            fontSize: 13,
                            letterSpacing: '-0.065px',
                            lineHeight: '18.85px',
                          }}
                        >
                          {card.content}
                        </p>
                      )}

                      {/* Footer row */}
                      {editingCard?.id !== card.id && (
                        <div
                          className="flex items-center"
                          style={{ marginTop: 10, gap: 8 }}
                        >
                          {/* Vote button */}
                          <button
                            onClick={() => canEditNow && handleVote(card.id)}
                            disabled={!canEditNow}
                            className={`inline-flex items-center rounded-full font-mono ${
                              !canEditNow ? 'cursor-default opacity-70' : 'cursor-pointer'
                            }`}
                            style={{
                              height: 22,
                              paddingLeft: 12,
                              paddingRight: 12,
                              gap: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: isTop ? '#1A1424' : '#F1ECF7',
                              color: isTop ? '#FAF8FD' : '#443458',
                            }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 16 16"
                              fill="currentColor"
                            >
                              <path d="M8.834.066c.763.087 1.5.295 2.01.884.505.581.656 1.378.656 2.3 0 .467-.087 1.119-.157 1.637L11.328 5h1.422c.603 0 1.174.085 1.668.485.517.418.83 1.044.929 1.765.088.64.166 1.524.086 2.343a6.1 6.1 0 0 1-.805 2.596c-.359.595-.91 1.09-1.578 1.342-.652.245-1.376.244-2.05.244H7.247c-.56 0-1.109-.115-1.607-.376l-.142-.074a3.7 3.7 0 0 0-1.268-.392C4.098 12.906 4 12.778 4 12.625V6.78c0-.093.045-.18.126-.22C5.253 5.993 6.07 5.19 6.596 4.2c.278-.523.545-1.1.697-1.6.146-.479.26-1.074.188-1.573-.057-.375.193-.714.556-.82z" />
                              <path d="M2.75 6h-.5a.75.75 0 0 0-.75.75v5.5c0 .414.336.75.75.75h.5a.75.75 0 0 0 .75-.75v-5.5A.75.75 0 0 0 2.75 6" />
                            </svg>
                            {card.votes}
                          </button>

                          {/* Spacer pushes right group to the end */}
                          <div className="flex-1" />

                          {/* Right group: action item tag + author/anon + edit/delete */}
                          <div className="flex items-center" style={{ gap: 8 }}>
                            {/* Action item tag */}
                            {card.isActionItem && (
                              <span
                                className="inline-flex items-center"
                                style={{
                                  backgroundColor: '#ECE0FA',
                                  color: '#3A1078',
                                  fontSize: 11,
                                  fontWeight: 500,
                                  height: 22,
                                  paddingLeft: 8,
                                  paddingRight: 8,
                                  borderRadius: 2,
                                }}
                              >
                                action item
                              </span>
                            )}

                            {/* Author / anonymous indicator */}
                            {isRevealed && authorLabel ? (
                              <span
                                className="italic text-mute"
                                style={{ fontSize: 11 }}
                              >
                                {authorLabel}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center justify-center rounded-full font-mono"
                                style={{
                                  width: 18,
                                  height: 18,
                                  backgroundColor: '#E5DBF0',
                                  color: '#7A6F88',
                                  fontSize: 9,
                                  fontWeight: 600,
                                }}
                              >
                                ?
                              </span>
                            )}

                            {/* Edit / Delete — hover only */}
                            {canEditNow && (
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    setEditingCard({ id: card.id, content: card.content })
                                  }
                                  className="p-1 rounded text-mute hover:text-ink"
                                  title="Edit"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteCard(card.id)}
                                  className="p-1 rounded text-mute hover:text-danger"
                                  title="Delete"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add a card button */}
              {canEditNow && (
                <div style={{ padding: '0 12px 12px' }}>
                  {newCard?.column === col.key ? (
                    <div className="space-y-2">
                      <textarea
                        value={newCard.content}
                        onChange={(e) => setNewCard({ ...newCard, content: e.target.value })}
                        placeholder="What stood out?"
                        autoFocus
                        rows={3}
                        className="w-full rounded border border-rule bg-card p-2 focus:border-lilac focus:outline-none"
                        style={{ fontSize: 13 }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleAddCard(col.key)}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setNewCard(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewCard({ column: col.key, content: '' })}
                      className="w-full flex items-center justify-center gap-1.5 border border-dashed border-rule text-mute hover:text-ink"
                      style={{ height: 40, fontSize: 12, fontWeight: 500, borderRadius: 0 }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                      </svg>
                      Add a card &middot; anonymously
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Close-retro confirmation modal */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
          <div className="bg-card rounded-xl p-6 max-w-md w-full mx-4">
            <h2
              className="font-serif text-text mb-2"
              style={{ fontSize: 22 }}
            >
              Close this retro?
            </h2>
            <p className="text-[14px] text-mute mb-4">
              Once closed, no one can add, edit, vote on, or delete cards. This action
              can&rsquo;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleClose}>Close retro</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
