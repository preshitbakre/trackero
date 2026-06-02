import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/render';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('fires onChange when typing', async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders as a textbox by default', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders disabled state', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders email type', () => {
    render(<Input type="email" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('renders password type with toggle button', () => {
    render(<Input type="password" placeholder="Secret" />);
    // Password fields don't expose role="textbox"; query by placeholder
    const input = screen.getByPlaceholderText('Secret');
    expect(input).toHaveAttribute('type', 'password');
    // Toggle button should be present
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    render(<Input type="password" placeholder="Secret" />);
    const input = screen.getByPlaceholderText('Secret');
    const toggle = screen.getByRole('button', { name: /show password/i });

    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
  });

  it('reflects a controlled value', () => {
    render(<Input value="prefilled" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('prefilled');
  });
});
