import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/render';
import { CreateProjectDialog } from './CreateProjectDialog';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: { post: vi.fn().mockResolvedValue({ data: { data: { item: { id: 1, name: 'X', prefix: 'X' } } } }) },
}));

describe('CreateProjectDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables Create until a methodology is chosen', () => {
    render(<CreateProjectDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Cubitraq/i), { target: { value: 'Demo' } });
    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeDisabled();
  });

  it('enables Create after choosing a methodology and toggles aria-checked', () => {
    render(<CreateProjectDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Cubitraq/i), { target: { value: 'Demo' } });
    const kanban = screen.getByRole('radio', { name: /Kanban/i });
    expect(kanban).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(kanban);
    expect(kanban).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Scrum/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /^create$/i })).not.toBeDisabled();
  });

  it('submits with the chosen methodology in the request body', async () => {
    const onCreated = vi.fn();
    render(<CreateProjectDialog onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/Cubitraq/i), { target: { value: 'Demo' } });
    fireEvent.click(screen.getByRole('radio', { name: /Kanban/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/projects',
      expect.objectContaining({ methodology: 'kanban' }),
    );
  });
});
