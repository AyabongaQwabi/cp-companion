'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none bg-gray-200/80 rounded-input ${className}`}
    />
  );
}
