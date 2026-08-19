'use client';

import type { ComponentProps } from 'react';

type InputProps = ComponentProps<'input'>;
type SelectProps = ComponentProps<'select'>;

const fieldClasses =
  'border border-gray-300 rounded-input px-3 py-1.5 text-sm text-gray-900 bg-white ' +
  'transition-shadow duration-150 motion-reduce:transition-none ' +
  'focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 ' +
  'placeholder:text-gray-400 disabled:opacity-50 disabled:bg-gray-50';

export function Input({ className = '', ...props }: InputProps) {
  return <input className={`${fieldClasses} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectProps) {
  return <select className={`${fieldClasses} ${className}`} {...props} />;
}
