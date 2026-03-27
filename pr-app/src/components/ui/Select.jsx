import React from 'react';
import { ChevronDown } from 'lucide-react';

export const Select = React.forwardRef(({ 
  label, 
  error, 
  options = [], 
  className = '', 
  containerClassName = '',
  placeholder = "Select an option...",
  ...props 
}, ref) => {
  
  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`} style={{ marginBottom: 'var(--space-form-gap)' }}>
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
      <div className="relative">
        <select
          ref={ref}
          className={`
            appearance-none w-full bg-[var(--color-input-bg)] text-[var(--color-primary-text)]
            border outline-none transition-all duration-200 cursor-pointer
            ${error ? 'border-[var(--color-error)]' : 'border-[var(--color-input-border)] focus:border-[var(--color-focus-border)] focus:ring-2 focus:ring-[var(--brand-light-blue)] focus:ring-opacity-20'}
            ${className}
          `}
          style={{
            height: 'var(--size-input-height)',
            padding: 'var(--size-input-padding)',
            borderRadius: 'var(--size-input-radius)',
            paddingRight: '2.5rem',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none'
          }}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt, idx) => (
            <option key={idx} value={opt.value !== undefined ? opt.value : opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
        <div className="absolute right-3 inset-y-0 flex items-center pointer-events-none text-slate-400">
          <ChevronDown size={20} />
        </div>
      </div>
      {error && (
        <span className="text-xs font-semibold text-[var(--color-error)] mt-1">{error}</span>
      )}
    </div>
  );
});

Select.displayName = 'Select';
