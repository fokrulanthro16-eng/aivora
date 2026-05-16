'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Search, Lightbulb, RotateCcw, Zap, Check, Loader2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { AgentPhase, ReasoningTrace } from '@/lib/types/agent';

type Step = { id: AgentPhase; label: string; icon: typeof Brain; hint: string };

const STEPS: Step[] = [
  { id: 'plan',        label: 'Plan',         icon: Brain,     hint: 'Classify intent + decompose query' },
  { id: 'retrieve',    label: 'Retrieve',      icon: Search,    hint: 'Hybrid vector + keyword search' },
  { id: 'reflect',     label: 'Reflect',       icon: Lightbulb, hint: 'Assess retrieval quality' },
  { id: 'self_correct',label: 'Self-Correct',  icon: RotateCcw, hint: 'Rewrite query if context is weak' },
  { id: 'respond',     label: 'Respond',       icon: Zap,       hint: 'Generate grounded answer' },
];

const PHASE_ORDER: AgentPhase[] = ['plan', 'retrieve', 'reflect', 'self_correct', 'respond'];

function status(stepId: AgentPhase, phase: AgentPhase): 'done' | 'active' | 'pending' {
  if (phase === 'idle' || phase === 'error') return 'pending';
  const ci = PHASE_ORDER.indexOf(phase);
  const si = PHASE_ORDER.indexOf(stepId);
  if (si < ci) return 'done';
  if (si === ci) return 'active';
  return 'pending';
}

type Props = { currentPhase: AgentPhase; trace?: ReasoningTrace; className?: string };

export function ReasoningTimeline({ currentPhase, trace, className }: Props) {
  const isRunning = currentPhase !== 'idle' && currentPhase !== 'error';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Step chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((step, i) => {
          const s = status(step.id, currentPhase);
          const Icon = step.icon;
          return (
            <div key={step.id} className="flex items-center gap-1">
              <motion.div
                title={step.hint}
                className={cn(
                  'group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-medium cursor-default select-none',
                  s === 'done'   && 'bg-cyan-400/8 border-cyan-400/25 text-cyan-300/80',
                  s === 'active' && 'bg-violet-500/15 border-violet-400/45 text-violet-200',
                  s === 'pending'&& 'bg-white/3 border-white/8 text-white/25'
                )}
                animate={
                  s === 'active'
                    ? { boxShadow: ['0 0 0px rgba(139,92,246,0)', '0 0 18px rgba(139,92,246,0.45)', '0 0 0px rgba(139,92,246,0)'] }
                    : {}
                }
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                {s === 'active' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                ) : s === 'done' ? (
                  <Check className="w-3 h-3 text-cyan-400" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span>{step.label}</span>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-lg bg-slate-900 border border-white/10 text-[9px] text-white/50 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {step.hint}
                </div>
              </motion.div>

              {i < STEPS.length - 1 && (
                <motion.div
                  className="w-3 h-px rounded-full"
                  animate={{
                    background:
                      status(STEPS[i + 1]!.id, currentPhase) !== 'pending'
                        ? '#22d3ee60'
                        : 'rgba(255,255,255,0.08)',
                  }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </div>
          );
        })}

        {/* Running indicator */}
        <AnimatePresence>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-2 flex items-center gap-1.5 text-[9px] font-mono text-white/25"
            >
              <Terminal className="w-3 h-3" />
              <span>loop running…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trace log — shown after completion */}
      <AnimatePresence>
        {trace && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-x-6 gap-y-0.5 pt-1">
              {trace.plan.length > 0 && (
                <div className="text-[10px] font-mono text-white/35">
                  <span className="text-cyan-500/60">PLAN: </span>
                  {trace.plan.join(' → ')}
                </div>
              )}
              {trace.retrievalSummary && (
                <div className="text-[10px] font-mono text-white/25">
                  <span className="text-sky-400/50">RETRIEVE: </span>
                  {trace.retrievalSummary.length > 80
                    ? trace.retrievalSummary.slice(0, 80) + '…'
                    : trace.retrievalSummary}
                </div>
              )}
              {trace.reflection && (
                <div className="text-[10px] font-mono text-white/30">
                  <span className="text-violet-400/60">REFLECT: </span>
                  {trace.reflection.length > 80 ? trace.reflection.slice(0, 80) + '…' : trace.reflection}
                </div>
              )}
              {trace.corrections.length > 0 && (
                <div className="text-[10px] font-mono text-amber-400/40">
                  <span className="text-amber-400/65">CORRECT: </span>
                  {trace.corrections.join('; ')}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
