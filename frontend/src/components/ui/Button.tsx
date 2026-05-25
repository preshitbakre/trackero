interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'ink' | 'outline';
  size?: 'sm' | 'md';
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-lilac text-white hover:bg-lilac-dark',
  secondary: 'bg-card text-text border border-rule hover:bg-paper',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'bg-transparent text-mute hover:bg-lilac-tint hover:text-lilac-dark',
  success: 'bg-mint-dark text-white hover:opacity-90',
  ink: 'bg-ink text-[var(--paper)] hover:opacity-90',
  outline: 'bg-transparent text-ink border border-rule hover:bg-paper',
};

const SQUARE_VARIANTS = new Set(['outline']);

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const radius = SQUARE_VARIANTS.has(variant) ? 'rounded-none' : 'rounded-md';
  return (
    <button
      className={`inline-flex items-center justify-center font-medium ${radius} transition-all duration-100 h-[32px] ${
        size === 'sm' ? 'px-3 text-[13px]' : 'px-4 text-[14px]'
      } ${VARIANTS[variant]} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
