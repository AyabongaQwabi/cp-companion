'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill text-sm font-medium ' +
  'transition-[transform,box-shadow,background-color,border-color] duration-150 ' +
  'motion-reduce:transition-none disabled:opacity-50 disabled:pointer-events-none ' +
  'hover:scale-[1.02] active:scale-[0.99] motion-reduce:hover:scale-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-red-500 to-red-600 text-white px-5 py-2.5 ' +
    'border border-gold-400/40 shadow-md hover:shadow-premium ' +
    'focus-visible:ring-red-400',
  secondary:
    'bg-white text-gray-900 border border-gray-300 px-5 py-2.5 ' +
    'hover:border-gray-400 hover:shadow-sm focus-visible:ring-gray-400',
  ghost:
    'text-gray-700 px-4 py-2 hover:bg-gray-100 focus-visible:ring-gray-400',
};

interface ButtonOwnProps {
  variant?: Variant;
  className?: string;
}

type ButtonProps = ButtonOwnProps & HTMLMotionProps<'button'>;
type LinkButtonProps = ButtonOwnProps & ComponentProps<typeof Link>;

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ variant = 'primary', className = '', ...props }: LinkButtonProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
