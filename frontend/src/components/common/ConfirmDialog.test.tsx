import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/render';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and message', () => {
    render(
      <ConfirmDialog
        title="Delete item?"
        message="This cannot be undone"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone')).toBeInTheDocument();
  });

  it('renders default Confirm and Cancel buttons', () => {
    render(
      <ConfirmDialog
        title="Confirm?"
        message="Sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('confirm button calls onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Confirm?"
        message="Sure?"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Confirm?"
        message="Sure?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmDialog
        title="Remove?"
        message="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Keep it"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
  });
});
