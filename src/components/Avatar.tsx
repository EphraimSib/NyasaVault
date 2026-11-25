import React from 'react';

export const Avatar: React.FC<{ name: string; className?: string }> = ({ name, className = 'w-10 h-10 text-sm' }) => {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <div aria-label={name} className={`rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-center shrink-0 ${className}`}>
      {initials || '?'}
    </div>
  );
};
