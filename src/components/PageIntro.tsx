'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageIntroProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export default function PageIntro({ title, description, icon: Icon, className = '' }: PageIntroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`mb-6 ${className}`}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <motion.div
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-red-100 bg-red-50 text-red-600"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </motion.div>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-gray-600 mt-1 leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
