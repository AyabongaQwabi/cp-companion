'use client';

import type { ReactNode } from 'react';

type Tone = 'neutral' | 'red' | 'gold' | 'green';

const tones: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  red: 'bg-red-50 text-red-700',
  gold: 'bg-gold-50 text-gold-700 border border-gold-300/60',
  green: 'bg-green-50 text-green-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
