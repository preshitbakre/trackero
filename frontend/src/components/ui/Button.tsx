interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md';
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-lilac text-white hover:bg-lilac-dark dark:bg-lilac dark:text-white',
  secondary: 'bg-card text-text border border-rule hover:bg-paper dark:bg-dneutral-200 dark:text-dneutral-600 dark:border-dneutral-300 dark:hover:bg-dneutral-300',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'bg-transparent text-mute hover:bg-lilac-tint hover:text-lilac-dark dark:text-dneutral-500 dark:hover:bg-dneutral-200',
  success: 'bg-mint-dark text-white hover:opacity-90 dark:bg-mint-dm dark:text-neutral-700',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-md transition-all duration-100 h-[32px] ${
        size === 'sm' ? 'px-3 text-[13px]' : 'px-4 text-[14px]'
      } ${VARIANTS[variant]} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
