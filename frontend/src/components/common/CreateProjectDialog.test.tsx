import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/render';
import { CreateProjectDialog } from './CreateProjectDialog';

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

  it('enables Create after choosing a methodology', () => {
    render(<CreateProjectDialog onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Cubitraq/i), { target: { value: 'Demo' } });
    fireEvent.click(screen.getByRole('button', { name: /Kanban/i }));
    expect(screen.getByRole('button', { name: /^create$/i })).not.toBeDisabled();
  });
});
