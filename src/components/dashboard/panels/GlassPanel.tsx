'use client';

import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  glow?: 'cyan' | 'violet' | 'blue' | 'none';
  title?: string;
  badge?: string;
};

const glowStyles: Record<NonNullable<GlassPanelProps['glow']>, string> = {
  cyan: 'border-cyan-400/25 shadow-[0_0_50px_rgba(34,211,238,0.12)] hover:border-cyan-300/40 hover:shadow-[0_0_70px_rgba(34,211,238,0.18)]',
  violet: 'border-violet-500/25 shadow-[0_0_50px_rgba(139,92,246,0.12)] hover:border-violet-400/40 hover:shadow-[0_0_70px_rgba(139,92,246,0.18)]',
  blue: 'border-sky-400/25 shadow-[0_0_50px_rgba(56,189,248,0.12)] hover:border-sky-300/40 hover:shadow-[0_0_70px_rgba(56,189,248,0.18)]',
  none: 'border-white/10',
};

export function GlassPanel({ children, className, glow = 'cyan', title, badge }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'relative bg-slate-950/40 backdrop-blur-2xl border rounded-3xl transition-all duration-300',
        glowStyles[glow],
        className
      )}
    >
      {(title || badge) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {title && (
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70">
              {title}
            </span>
          )}
          {badge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 font-mono">
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
