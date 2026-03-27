import React from 'react';

export const Input = React.forwardRef(({ 
  label, 
  error, 
  className = '', 
  containerClassName = '',
  wrapperClassName = '',  // alias callers may pass — applied to container, NOT the <input>
  leftIcon,
  rightIcon,
  ...props 
}, ref) => {
  // Merge both container class names (some callers use wrapperClassName, others use containerClassName)
  const outerClass = [containerClassName, wrapperClassName].filter(Boolean).join(' ');
  return (
    <div className={`flex flex-col gap-1.5 ${outerClass}`} style={{ marginBottom: 'var(--space-form-gap)' }}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary-text)]">
          {typeof label === 'string' && label.includes('*') ? (
            <>
              {label.split('*').map((part, index, array) => (
                <React.Fragment key={index}>
                  {part}
                  {index < array.length - 1 && <span className="text-red-500">*</span>}
                </React.Fragment>
              ))}
            </>
          ) : (
            label
          )}
        </label>
      )}
      <div 
        className={`flex items-center overflow-hidden bg-[var(--color-input-bg)] border transition-all duration-200
          ${error ? 'border-[var(--color-error)]' : 'border-[var(--color-input-border)] focus-within:border-[var(--color-focus-border)] focus-within:ring-2 focus-within:ring-[var(--brand-light-blue)] focus-within:ring-opacity-20'}
        `}
        style={{
          height: 'var(--size-input-height)',
          borderRadius: 'var(--size-input-radius)'
        }}
      >
        {leftIcon && (
          <div className="pl-3 flex items-center justify-center text-slate-400 shrink-0" style={{ minWidth: 'var(--size-min-touch)' }}>
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            flex-1 w-full bg-transparent text-[var(--color-primary-text)]
            border-none outline-none focus:ring-0
            ${className}
          `}
          style={{
            height: '100%',
            padding: leftIcon ? '0 0.5rem' : '0 1rem',
            minWidth: 0
          }}
          {...props}
        />
        {rightIcon && (
          <div className="pr-1 flex items-center justify-center shrink-0">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <span className="text-xs font-semibold text-[var(--color-error)] mt-1">{error}</span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
