'use client';

import type { ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
};

/** Top-level layout wrapper for non-dashboard pages. */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {children}
    </div>
  );
}
