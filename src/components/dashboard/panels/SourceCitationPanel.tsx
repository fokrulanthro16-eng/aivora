'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, FileSearch, Fingerprint, Hash, Shield } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SourceCitation } from '@/lib/types/citation';

type Props = {
  citations: SourceCitation[];
  className?: string;
};

function confidenceLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.8) return { label: 'HIGH', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)' };
  if (score >= 0.6) return { label: 'MED', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' };
  return { label: 'LOW', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
}

function accentColor(score: number): string {
  if (score >= 0.8) return '#22d3ee';
  if (score >= 0.6) return '#8b5cf6';
  return '#f59e0b';
}

export function SourceCitationPanel({ citations, className }: Props) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <FileSearch className="w-3.5 h-3.5 text-violet-400/70" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400/80">
            Intelligence Sources
          </span>
        </div>
        {citations.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/12 border border-violet-400/20">
            <Shield className="w-2.5 h-2.5 text-violet-300" />
            <span className="text-[9px] font-mono text-violet-300">{citations.length} verified</span>
          </div>
        )}
      </div>

      {/* Citation list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {citations.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center">
                <FileSearch className="w-5 h-5 text-white/15" />
              </div>
              <div>
                <p className="text-white/30 text-sm font-medium mb-1">No sources yet</p>
                <p className="text-white/15 text-xs max-w-[180px] leading-relaxed">
                  Verified citations appear here after each query. Upload documents to enable grounded retrieval.
                </p>
              </div>
            </motion.div>
          ) : (
            citations.map((c, i) => {
              const conf = confidenceLabel(c.relevanceScore);
              const accent = accentColor(c.relevanceScore);
              return (
                <motion.div
                  key={c.chunkId}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ delay: i * 0.06, duration: 0.28 }}
                >
                  <div
                    className="relative rounded-2xl overflow-hidden border border-white/8 bg-white/2 hover:bg-white/4 transition-colors duration-200 group"
                    style={{ borderLeft: `2px solid ${accent}` }}
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Fingerprint className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
                        <span className="text-[11px] font-semibold text-white/80 truncate">
                          {c.documentTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Confidence badge */}
                        <span
                          className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{ color: conf.color, background: conf.bg }}
                        >
                          {conf.label}
                        </span>
                        {c.sourceUrl && (
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/20 hover:text-cyan-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-2 px-3.5 pb-1.5">
                      {c.pageNumber && (
                        <div className="flex items-center gap-1 text-[9px] text-white/30">
                          <Hash className="w-2 h-2" />
                          <span>p.{c.pageNumber}</span>
                        </div>
                      )}
                      {c.fileName && (
                        <span className="text-[9px] font-mono text-white/25 truncate max-w-[110px]">
                          {c.fileName}
                        </span>
                      )}
                      {/* Relevance bar */}
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-14 h-1 rounded-full bg-white/8 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: accent }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round(c.relevanceScore * 100)}%` }}
                            transition={{ duration: 0.6, delay: i * 0.08 }}
                          />
                        </div>
                        <span className="text-[9px] text-white/30 font-mono">
                          {(c.relevanceScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Quoted text */}
                    <div className="px-3.5 pb-3">
                      <blockquote
                        className="text-[10px] leading-relaxed text-white/45 italic border-l pl-2 py-0.5"
                        style={{ borderColor: `${accent}35` }}
                      >
                        &ldquo;{c.quotedText.length > 200 ? c.quotedText.slice(0, 200) + '…' : c.quotedText}&rdquo;
                      </blockquote>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
