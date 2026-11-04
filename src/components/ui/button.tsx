import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'white';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] cursor-pointer';

    const sizeStyles = {
      xs: 'text-xs px-2.5 py-1 gap-1.5',
      sm: 'text-xs px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
    }[size];

    const variantStyles = {
      primary:
        'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow focus-visible:ring-indigo-500 border border-transparent',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-800 focus-visible:ring-slate-400 border border-slate-200/60',
      outline:
        'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs focus-visible:ring-indigo-500',
      ghost:
        'bg-transparent hover:bg-slate-100 text-slate-700 focus-visible:ring-slate-400',
      danger:
        'bg-rose-600 hover:bg-rose-700 text-white shadow-sm focus-visible:ring-rose-500 border border-transparent',
      white:
        'bg-white hover:bg-indigo-50 text-indigo-700 hover:text-indigo-800 shadow-md hover:shadow-lg focus-visible:ring-white border border-transparent font-semibold',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
