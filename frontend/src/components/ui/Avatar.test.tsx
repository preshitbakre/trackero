import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/render';
import { Avatar } from './Avatar';

const mockUser = { id: 1, displayName: 'Jane Doe' };
const mockUserWithAvatar = { id: 2, displayName: 'John Smith', avatarUrl: 'https://example.com/img.png' };

describe('Avatar', () => {
  it('renders an img when avatarUrl is provided', () => {
    render(<Avatar user={mockUserWithAvatar} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img.png');
    expect(img).toHaveAttribute('alt', 'John Smith');
  });

  it('renders initials fallback when no avatarUrl', () => {
    render(<Avatar user={mockUser} />);
    // Renders a span with role="img" containing initials
    const avatar = screen.getByRole('img');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent('JD');
  });

  it('uses aria-label equal to displayName', () => {
    render(<Avatar user={mockUser} />);
    expect(screen.getByRole('img', { name: 'Jane Doe' })).toBeInTheDocument();
  });

  it('computes single-word initials correctly', () => {
    render(<Avatar user={{ id: 3, displayName: 'Mononym' }} />);
    expect(screen.getByRole('img')).toHaveTextContent('M');
  });

  it('renders with sm size by default without crashing', () => {
    render(<Avatar user={mockUser} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders with lg size without crashing', () => {
    render(<Avatar user={mockUser} size="lg" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
