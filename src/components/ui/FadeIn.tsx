'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const variants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Reveal on scroll into view (marketing pages only) instead of on mount. */
  onScroll?: boolean;
}

export function FadeIn({ children, delay = 0, className, onScroll = false }: FadeInProps) {
  return (
    <motion.div
      initial="hidden"
      animate={onScroll ? undefined : 'visible'}
      whileInView={onScroll ? 'visible' : undefined}
      viewport={onScroll ? { once: true, margin: '-80px' } : undefined}
      variants={variants}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
