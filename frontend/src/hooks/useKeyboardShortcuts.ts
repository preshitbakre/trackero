import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface ShortcutCallbacks {
  onCreateItem?: () => void;
  onOpenSearch?: () => void;
  onAssignToMe?: () => void;
}

export function useKeyboardShortcuts(callbacks: ShortcutCallbacks) {
  const navigate = useNavigate();
  const { id: projectId } = useParams();
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

      // Always allow Escape
      if (e.key === 'Escape') return;

      // Cmd+K handled by AppShell already
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') return;

      // Don't handle shortcuts when typing in inputs
      if (isInput) return;

      // '/' → focus search (handled by AppShell)
      if (e.key === '/') {
        e.preventDefault();
        callbacks.onOpenSearch?.();
        return;
      }

      // 'C' → create new item (default type: task)
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        callbacks.onCreateItem?.();
        return;
      }

      // 'M' → assign to me
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        callbacks.onAssignToMe?.();
        return;
      }

      // '?' → show shortcuts help
      if (e.key === '?') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('show-shortcuts-help'));
        return;
      }

      // G + key combos (sequential)
      if (e.key === 'g' || e.key === 'G') {
        if (!gPressedRef.current) {
          gPressedRef.current = true;
          gTimerRef.current = setTimeout(() => { gPressedRef.current = false; }, 1000);
          return;
        }
      }

      if (gPressedRef.current) {
        gPressedRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);

        if (!projectId) return;
        switch (e.key) {
          case 'b': case 'B': navigate(`/projects/${projectId}/board`); break;
          case 'l': case 'L': navigate(`/projects/${projectId}/backlog`); break;
          case 's': case 'S': navigate(`/projects/${projectId}/sprints`); break;
          case 'e': case 'E': navigate(`/projects/${projectId}/epics`); break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, projectId, callbacks]);
}
