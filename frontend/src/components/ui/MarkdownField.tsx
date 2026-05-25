import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export function MarkdownField({
  value,
  onChange,
  onBlur,
  placeholder = 'Add a description...',
  readOnly = false,
  minHeight = 80,
}: MarkdownFieldProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
    }
  }, [editing, value, minHeight]);

  if (editing && !readOnly) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.max(minHeight, e.target.scrollHeight)}px`;
        }}
        onBlur={() => {
          setEditing(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent outline-none"
        style={{
          fontSize: 14,
          lineHeight: '22.4px',
          color: 'var(--ink-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          padding: '8px 10px',
          minHeight,
          fontFamily: 'inherit',
        }}
      />
    );
  }

  if (!value) {
    return (
      <div
        onClick={() => !readOnly && setEditing(true)}
        className={readOnly ? '' : 'cursor-pointer'}
        style={{
          fontSize: 14,
          lineHeight: '22.4px',
          color: 'var(--ink-4)',
          minHeight: 32,
          padding: '4px 0',
        }}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div
      onClick={() => !readOnly && setEditing(true)}
      className={`markdown-body ${readOnly ? '' : 'cursor-pointer'}`}
      style={{
        fontSize: 14,
        lineHeight: '22.4px',
        color: 'var(--ink-2)',
        minHeight: 32,
        padding: '4px 0',
      }}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
    </div>
  );
}
