'use client';

// Three.js / React Three Fiber — this file is only loaded client-side via next/dynamic.
// Do NOT import directly; use the dynamic wrapper in AivoraShell.

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { cn } from '@/lib/utils/cn';
import type { AgentPhase, SystemMode } from '@/lib/types/agent';

const PHASE_COLORS: Record<AgentPhase, string> = {
  idle: '#22d3ee',
  plan: '#38bdf8',
  retrieve: '#8b5cf6',
  reflect: '#22d3ee',
  self_correct: '#f59e0b',
  respond: '#4ade80',
  error: '#ef4444',
};

const MODE_SECONDARY: Record<SystemMode, string> = {
  demo: '#f59e0b',
  rag: '#22d3ee',
  'local-webllm': '#8b5cf6',
  'error-safe': '#ef4444',
};

const PHASE_LABELS: Record<AgentPhase, string> = {
  idle: 'STANDBY',
  plan: 'PLANNING',
  retrieve: 'RETRIEVING',
  reflect: 'REFLECTING',
  self_correct: 'CORRECTING',
  respond: 'GENERATING',
  error: 'ERROR',
};

/* ── Sub-components (rendered inside Canvas) ─────────────────────────────── */

function CoreOrb({ color, isActive }: { color: THREE.Color; isActive: boolean }) {
  const ref = useRef<THREE.Mesh | null>(null);
  useFrame((state) => {
    if (!ref.current) return;
    if (isActive) ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.055);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.82, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isActive ? 1.5 : 0.7}
        transparent
        opacity={0.88}
      />
    </mesh>
  );
}

function Ring({
  radius,
  tube,
  color,
  sx = 0,
  sy = 0,
  sz = 0,
}: {
  radius: number;
  tube: number;
  color: THREE.Color;
  sx?: number;
  sy?: number;
  sz?: number;
}) {
  const ref = useRef<THREE.Mesh | null>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.x = t * sx;
    ref.current.rotation.y = t * sy;
    ref.current.rotation.z = t * sz;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, tube, 16, 64]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} transparent opacity={0.6} />
    </mesh>
  );
}

function OrbitingParticles({
  radius,
  color,
  count,
  isActive,
}: {
  radius: number;
  color: THREE.Color;
  count: number;
  isActive: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const positions = useMemo<[number, number, number][]>(() => {
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a * 0.6) * 0.45, Math.sin(a) * radius];
    });
  }, [count, radius]);

  useFrame((state) => {
    if (groupRef.current && isActive) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.55;
    }
  });

  if (!isActive) return null;
  return (
    <group ref={groupRef}>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ phase, systemMode }: { phase: AgentPhase; systemMode: SystemMode }) {
  const phaseHex = PHASE_COLORS[phase] ?? '#22d3ee';
  const modeHex = MODE_SECONDARY[systemMode] ?? '#22d3ee';
  const isActive = phase !== 'idle' && phase !== 'error';

  const phaseColor = useMemo(() => new THREE.Color(phaseHex), [phaseHex]);
  const modeColor = useMemo(() => new THREE.Color(modeHex), [modeHex]);

  return (
    <>
      <ambientLight intensity={0.06} />
      <pointLight color={phaseHex} intensity={isActive ? 5 : 2.5} distance={12} />
      <pointLight color={modeHex} intensity={1.5} position={[3, 2, 2]} distance={10} />

      <CoreOrb color={phaseColor} isActive={isActive} />

      <Ring radius={1.75} tube={0.018} color={phaseColor} sx={0.45} sy={0.15} />
      <Ring radius={2.25} tube={0.013} color={modeColor} sy={0.65} sz={0.25} />
      <Ring radius={2.75} tube={0.008} color={phaseColor} sx={0.25} sz={0.5} />

      <OrbitingParticles radius={3.1} color={phaseColor} count={14} isActive={isActive} />
    </>
  );
}

/* ── Public component ────────────────────────────────────────────────────── */

type Props = {
  phase: AgentPhase;
  systemMode: SystemMode;
  className?: string;
};

export function HolographicCore3D({ phase, systemMode, className }: Props) {
  const label = PHASE_LABELS[phase];
  const color = PHASE_COLORS[phase];

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: 280, height: 280 }}
    >
      <Canvas
        camera={{ position: [0, 0, 6.8], fov: 44 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
      >
        <Scene phase={phase} systemMode={systemMode} />
      </Canvas>

      {/* Phase label overlaid on canvas */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <AnimatePresence mode="wait">
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22 }}
            className="text-[9px] font-mono font-bold tracking-widest"
            style={{ color }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
