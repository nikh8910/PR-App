import React from 'react';

export const Button = ({ 
  children, 
  variant = 'primary', 
  fullWidth = true, 
  className = '', 
  ...props 
}) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 cursor-pointer
    focus:outline-none focus:ring-2 focus:ring-offset-2
  `;
  
  const variantClasses = {
    primary: 'bg-brand-blue text-white hover:brightness-95 active:brightness-90 shadow-md',
    secondary: 'bg-white text-[var(--color-secondary-text)] border border-[var(--color-input-border)] hover:bg-slate-50 active:bg-slate-100 shadow-sm',
    danger: 'bg-[var(--color-error)] text-white hover:brightness-95 active:brightness-90 shadow-md',
    ghost: 'bg-transparent text-[var(--color-primary-text)] hover:bg-slate-100 active:bg-slate-200'
  };

  const style = {
    height: 'var(--size-full-button-height)',
    minHeight: 'var(--size-min-touch)',
    padding: 'var(--size-full-button-padding)',
    borderRadius: 'var(--radius-xl)',
    width: fullWidth ? '100%' : 'auto',
    fontSize: 'var(--font-size-button)'
  };

  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
};
