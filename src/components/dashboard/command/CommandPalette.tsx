'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type PaletteCommand = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  shortcut?: string;
  action: () => void;
};

type Props = {
  commands: PaletteCommand[];
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ commands, open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // Reset state and close — called from event handlers, not from effects.
  const handleClose = useCallback(() => {
    setQuery('');
    setSelected(0);
    onClose();
  }, [onClose]);

  const runSelected = useCallback(() => {
    const cmd = filtered[selected];
    if (cmd) {
      cmd.action();
      handleClose();
    }
  }, [filtered, selected, handleClose]);

  // Focus input when opened — no setState here.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Global keyboard handler — setState only inside the event callback,
  // which is NOT a direct synchronous call in the effect body.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered.length, handleClose, runSelected]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed z-50 left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2"
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            <div className="bg-slate-950/95 backdrop-blur-2xl border border-cyan-400/20 rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(34,211,238,0.15)]">
              {/* Search row */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(0); // reset selection on each keystroke — event handler, not effect
                  }}
                  placeholder="Type a command…"
                  className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none"
                />
                <button onClick={handleClose} className="text-white/25 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Command list */}
              <div className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-white/25 text-sm">No commands found</div>
                ) : (
                  filtered.map((cmd, i) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          i === selected
                            ? 'bg-cyan-400/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                        )}
                        onMouseEnter={() => setSelected(i)}
                        onClick={() => { cmd.action(); handleClose(); }}
                      >
                        <div
                          className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                            i === selected ? 'bg-cyan-400/15' : 'bg-white/5'
                          )}
                        >
                          <Icon className={cn('w-3.5 h-3.5', i === selected ? 'text-cyan-300' : 'text-white/40')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium">{cmd.label}</div>
                          <div className="text-[10px] text-white/30 truncate">{cmd.description}</div>
                        </div>
                        {cmd.shortcut && (
                          <kbd className="text-[9px] font-mono text-white/25 border border-white/15 rounded px-1.5 py-0.5">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[9px] text-white/20 font-mono">
                <span>↑↓ navigate</span>
                <span>↵ run</span>
                <span>esc close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
