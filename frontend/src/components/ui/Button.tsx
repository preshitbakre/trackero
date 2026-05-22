interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md';
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-peri-dark text-white hover:bg-[#2D4A74] dark:bg-peri-dm dark:text-neutral-700',
  secondary: 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-dneutral-300 dark:text-dneutral-600 dark:hover:bg-dneutral-400',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'bg-transparent text-neutral-500 hover:bg-neutral-100 dark:text-dneutral-500 dark:hover:bg-dneutral-200',
  success: 'bg-mint text-white hover:opacity-90 dark:bg-mint-dm dark:text-neutral-700',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-md transition-all duration-100 h-[30px] ${
        size === 'sm' ? 'px-2 text-[14px]' : 'px-4 text-[16px]'
      } ${VARIANTS[variant]} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
