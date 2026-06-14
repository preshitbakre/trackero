import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjectMethodology } from './useProjectMethodology';

vi.mock('../api/client', () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: { data: { methodology: 'kanban' } } }) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useProjectMethodology', () => {
  it('returns the project methodology', async () => {
    const { result } = renderHook(() => useProjectMethodology('5'), { wrapper });
    await waitFor(() => expect(result.current.methodology).toBe('kanban'));
  });
});
