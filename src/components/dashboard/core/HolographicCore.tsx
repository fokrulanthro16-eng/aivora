'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { NeuralRing } from './NeuralRing';
import { cn } from '@/lib/utils/cn';
import type { AgentPhase } from '@/lib/types/agent';

type HolographicCoreProps = {
  phase: AgentPhase;
  className?: string;
};

const phaseLabel: Record<AgentPhase, string> = {
  idle: 'STANDBY',
  plan: 'PLANNING',
  retrieve: 'RETRIEVING',
  reflect: 'REFLECTING',
  self_correct: 'CORRECTING',
  respond: 'GENERATING',
  error: 'ERROR',
};

const phaseColor: Record<AgentPhase, string> = {
  idle: '#22d3ee',
  plan: '#38bdf8',
  retrieve: '#8b5cf6',
  reflect: '#22d3ee',
  self_correct: '#f59e0b',
  respond: '#4ade80',
  error: '#ef4444',
};

export function HolographicCore({ phase, className }: HolographicCoreProps) {
  const isActive = phase !== 'idle' && phase !== 'error';
  const color = phaseColor[phase];
  const label = phaseLabel[phase];

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Outer ambient glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 320,
          height: 320,
          background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
        }}
        animate={{ scale: isActive ? [1, 1.15, 1] : 1, opacity: isActive ? [0.6, 1, 0.6] : 0.4 }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Outer slow ring */}
      <NeuralRing
        size={240}
        color={color}
        thickness={1}
        speed={isActive ? 6 : 14}
        className="absolute"
      />

      {/* Middle pulsing ring */}
      <NeuralRing
        size={190}
        color={color === '#22d3ee' ? '#8b5cf6' : color}
        thickness={1.5}
        speed={isActive ? 4 : 10}
        reverse
        pulse={isActive}
        className="absolute"
      />

      {/* Inner fast ring */}
      <NeuralRing
        size={145}
        color={color}
        thickness={2}
        speed={isActive ? 2 : 7}
        className="absolute"
      />

      {/* Central orb */}
      <motion.div
        className="relative z-10 flex flex-col items-center justify-center rounded-full"
        style={{
          width: 100,
          height: 100,
          background: `radial-gradient(circle at 35% 35%, ${color}40, ${color}10 60%, transparent)`,
          border: `1px solid ${color}50`,
          boxShadow: `0 0 30px ${color}30, inset 0 0 20px ${color}15`,
        }}
        animate={{
          scale: isActive ? [1, 1.06, 1] : 1,
          boxShadow: isActive
            ? [`0 0 30px ${color}30, inset 0 0 20px ${color}15`, `0 0 60px ${color}50, inset 0 0 30px ${color}25`, `0 0 30px ${color}30, inset 0 0 20px ${color}15`]
            : `0 0 30px ${color}30, inset 0 0 20px ${color}15`,
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          className="text-[9px] font-mono font-bold tracking-widest text-center leading-tight"
          style={{ color }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="block"
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Orbiting particles */}
      {isActive && (
        <>
          {[0, 120, 240].map((deg) => (
            <motion.div
              key={deg}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              animate={{
                rotate: [deg, deg + 360],
                x: [Math.cos((deg * Math.PI) / 180) * 105, Math.cos(((deg + 360) * Math.PI) / 180) * 105],
                y: [Math.sin((deg * Math.PI) / 180) * 105, Math.sin(((deg + 360) * Math.PI) / 180) * 105],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
          ))}
        </>
      )}
    </div>
  );
}
