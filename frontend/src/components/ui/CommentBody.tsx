import React from 'react';

interface CommentBodyProps {
  body: string;
  style?: React.CSSProperties;
}

export function CommentBody({ body, style }: CommentBodyProps) {
  const parts = body.split(/(@\[[^\]]+\])/g);

  return (
    <div style={{ color: 'var(--ink-2)', lineHeight: '20px', whiteSpace: 'pre-wrap', ...style }}>
      {parts.map((part, i) =>
        /^@\[([^\]]+)\]$/.test(part) ? (
          <span key={i} style={{ color: 'var(--accent)', fontWeight: 500 }}>@{part.slice(2, -1)}</span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </div>
  );
}
