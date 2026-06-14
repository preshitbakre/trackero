import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MethodologyGuard } from './MethodologyGuard';

vi.mock('../../hooks/useProjectMethodology', () => ({
  useProjectMethodology: () => ({ methodology: 'kanban', isLoading: false }),
}));

describe('MethodologyGuard', () => {
  it('redirects scrum-only routes to the board for kanban projects', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/5/sprints']}>
        <Routes>
          <Route path="/projects/:id/sprints" element={<MethodologyGuard scrumOnly><div>Sprints</div></MethodologyGuard>} />
          <Route path="/projects/:id/board" element={<div>Board</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Board')).toBeInTheDocument());
    expect(screen.queryByText('Sprints')).not.toBeInTheDocument();
  });
});
