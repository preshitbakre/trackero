import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/render';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent(): never {
  throw new Error('Test error');
}

describe('ErrorBoundary', () => {
  it('renders children normally when no error', () => {
    render(
      <ErrorBoundary>
        <span>Content</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('catches error and renders "Something went wrong" fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders a refresh/retry button in the fallback UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
