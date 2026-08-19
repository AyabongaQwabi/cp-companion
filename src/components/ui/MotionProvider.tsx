'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

// Global reduced-motion switch — Framer Motion animations across the app collapse to instant
// (no transform/opacity animation) when the user has requested reduced motion at the OS level.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
