import { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from './Avatar';

interface MentionUser {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  members: MentionUser[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  members,
  placeholder = 'Write a comment...',
  className = '',
  style,
}: MentionTextareaProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = mentionQuery !== null
    ? members.filter((m) => m.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  const getMentionContext = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return null;
    const cursor = el.selectionStart;
    const textBefore = value.substring(0, cursor);
    const match = textBefore.match(/@\[?([A-Za-z0-9 _.-]*)$/);
    if (!match) return null;
    return { query: match[1], start: match.index!, end: cursor };
  }, [value]);

  const updateMentionState = useCallback(() => {
    const ctx = getMentionContext();
    if (ctx) {
      setMentionQuery(ctx.query);
      setMentionIndex(0);
      const el = textareaRef.current;
      const container = containerRef.current;
      if (el && container) {
        setMenuPosition({ bottom: el.offsetHeight + 4, left: 0 });
      }
    } else {
      setMentionQuery(null);
    }
  }, [getMentionContext]);

  useEffect(() => {
    updateMentionState();
  }, [value, updateMentionState]);

  const insertMention = (user: MentionUser) => {
    const ctx = getMentionContext();
    if (!ctx) return;
    const before = value.substring(0, ctx.start);
    const after = value.substring(ctx.end);
    const mention = `@[${user.displayName}] `;
    const newValue = before + mention + after;
    onChange(newValue);
    setMentionQuery(null);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = ctx.start + mention.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filtered[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div ref={containerRef} className="flex-1" style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        className={`w-full bg-transparent outline-none resize-none ${className}`}
        style={{ fontSize: '13.5px', lineHeight: '18.9px', border: 'none', padding: 0, ...style }}
      />
      {mentionQuery !== null && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: menuPosition.bottom,
            left: menuPosition.left,
            width: 240,
            background: 'var(--card-bg, #fff)',
            border: '1px solid var(--line-2)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 50,
            maxHeight: 220,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {filtered.map((user, i) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(user);
              }}
              className="w-full text-left flex items-center gap-2"
              style={{
                padding: '6px 10px',
                fontSize: 13,
                background: i === mentionIndex ? 'var(--shade)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              <Avatar user={user} size="xs" />
              <span style={{ fontWeight: 500 }}>{user.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
