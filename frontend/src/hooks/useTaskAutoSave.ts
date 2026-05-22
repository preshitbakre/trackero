import { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseTaskAutoSaveOptions {
  projectId: number;
  taskId: number;
  onUpdated?: () => void;
}

export function useTaskAutoSave({ projectId, taskId, onUpdated }: UseTaskAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  }, []);

  const flushDebounce = useCallback(() => {
    if (pendingSaveRef.current) {
      clearTimeout(debounceRef.current);
      pendingSaveRef.current();
      pendingSaveRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        pendingSaveRef.current();
        pendingSaveRef.current = null;
      }
      clearTimeout(saveTimerRef.current);
      clearTimeout(debounceRef.current);
    };
  }, []);

  /** Save a field and reload task + notify parent */
  const saveFieldFull = useCallback(async (field: string, value: unknown, reloadTask?: () => Promise<void>) => {
    setSaveStatus('saving');
    try {
      await apiClient.put(`/projects/${projectId}/items/${taskId}`, { [field]: value });
      await reloadTask?.();
      onUpdated?.();
      showSaved();
    } catch {
      setSaveStatus('error');
      await reloadTask?.();
    }
  }, [projectId, taskId, onUpdated, showSaved]);

  /** Save a field quietly (no reload, no parent notify) */
  const saveFieldQuiet = useCallback(async (field: string, value: unknown, reloadTask?: () => Promise<void>) => {
    setSaveStatus('saving');
    try {
      await apiClient.put(`/projects/${projectId}/items/${taskId}`, { [field]: value });
      showSaved();
    } catch {
      setSaveStatus('error');
      await reloadTask?.();
    }
  }, [projectId, taskId, showSaved]);

  /** Debounced save for text fields (1.5s) */
  const debouncedFieldChange = useCallback((field: string, value: unknown, reloadTask?: () => Promise<void>) => {
    setSaveStatus('saving');
    clearTimeout(debounceRef.current);
    pendingSaveRef.current = () => saveFieldQuiet(field, value, reloadTask);
    debounceRef.current = setTimeout(() => {
      const fn = pendingSaveRef.current;
      pendingSaveRef.current = null;
      fn?.();
    }, 1500);
  }, [saveFieldQuiet]);

  /** Immediate save for select/dropdown fields */
  const handleFieldChange = useCallback((field: string, value: unknown, reloadTask?: () => Promise<void>) => {
    saveFieldFull(field, value, reloadTask);
  }, [saveFieldFull]);

  /** Save assignee (uses different endpoint) */
  const saveAssignee = useCallback(async (assigneeId: number | null, reloadTask?: () => Promise<void>) => {
    setSaveStatus('saving');
    try {
      await apiClient.put(`/projects/${projectId}/items/${taskId}`, { assigneeId });
      await reloadTask?.();
      onUpdated?.();
      showSaved();
    } catch {
      setSaveStatus('error');
      await reloadTask?.();
    }
  }, [projectId, taskId, onUpdated, showSaved]);

  return {
    saveStatus,
    flushDebounce,
    debouncedFieldChange,
    handleFieldChange,
    saveAssignee,
  };
}
