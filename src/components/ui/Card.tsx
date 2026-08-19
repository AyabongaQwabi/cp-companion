'use client';

import type { ComponentProps } from 'react';

type CardProps = ComponentProps<'div'> & { premium?: boolean };

export function Card({ className = '', premium = false, ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-gray-200 bg-white ${
        premium ? 'shadow-premium border-gold-300/50' : 'shadow-sm'
      } ${className}`}
      {...props}
    />
  );
}
