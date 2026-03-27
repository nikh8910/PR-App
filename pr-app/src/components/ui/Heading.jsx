import React from 'react';

export const Heading = ({ 
  children, 
  level = 2, 
  className = '', 
  ...props 
}) => {
  const Tag = `h${level}`;
  
  const sizeClasses = {
    1: 'text-2xl md:text-3xl lg:text-4xl',
    2: 'text-xl md:text-2xl',
    3: 'text-lg md:text-xl',
    4: 'text-base md:text-lg',
    5: 'text-sm font-bold',
    6: 'text-xs font-bold uppercase tracking-wider'
  };

  return (
    <Tag 
      className={`font-semibold text-[var(--color-primary-heading)] tracking-tight ${sizeClasses[level]} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
};
