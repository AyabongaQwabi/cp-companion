'use client';

import { LoaderCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export default function LoadingState({
  label = 'Loading dashboard data...',
  className = '',
}: LoadingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex items-center gap-2 rounded-card border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm ${className}`}
    >
      <LoaderCircle className="h-4 w-4 animate-spin text-red-500" aria-hidden="true" />
      <span>{label}</span>
    </motion.div>
  );
}
