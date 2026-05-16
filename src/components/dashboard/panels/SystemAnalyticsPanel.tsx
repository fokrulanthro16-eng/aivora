'use client';

import { motion } from 'framer-motion';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import {
  Cpu,
  Database,
  BrainCircuit,
  MemoryStick,
  Zap,
  Shield,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SystemMode, AgentAnalytics } from '@/lib/types/agent';
import { AIVORA_CONFIG } from '@/config/aivora';

const MODE_META: Record<
  SystemMode,
  { label: string; color: string; icon: typeof BrainCircuit; bg: string; border: string }
> = {
  rag: {
    label: 'RAG Mode',
    color: '#22d3ee',
    icon: Database,
    bg: 'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.25)',
  },
  'local-webllm': {
    label: 'Local WebLLM',
    color: '#8b5cf6',
    icon: BrainCircuit,
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.25)',
  },
  demo: {
    label: 'Aivora OS Lite',
    color: '#f59e0b',
    icon: FlaskConical,
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
  },
  'error-safe': {
    label: 'Error-Safe',
    color: '#ef4444',
    icon: AlertCircle,
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
  },
};

function MiniGauge({ value, color }: { value: number; color: string }) {
  const data = [{ name: 'val', value: Math.round(value * 100), fill: color }];
  return (
    <ResponsiveContainer width={52} height={52}>
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius="60%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
        data={data}
        barSize={6}
      >
        <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'rgba(255,255,255,0.05)' }} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  color = 'rgba(255,255,255,0.5)',
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[10px] text-white/35 uppercase tracking-wider font-mono">{label}</span>
      </div>
      <span className="text-[10px] font-mono font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function PrivacyBadge({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof Shield;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-mono',
        active
          ? 'bg-emerald-400/10 border border-emerald-400/20 text-emerald-300'
          : 'bg-white/3 border border-white/8 text-white/25'
      )}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span>{label}</span>
      {active && <CheckCircle2 className="w-2 h-2 ml-auto" />}
    </div>
  );
}

type Props = {
  systemMode: SystemMode;
  analytics: AgentAnalytics | undefined;
  supabaseConnected: boolean;
  webllmReady: boolean;
  className?: string;
};

export function SystemAnalyticsPanel({
  systemMode,
  analytics,
  supabaseConnected,
  webllmReady,
  className,
}: Props) {
  const meta = MODE_META[systemMode];
  const ModeIcon = meta.icon;
  const confidence = analytics?.confidence ?? 0;
  const citationCount = analytics?.citationCount ?? 0;
  const latencyMs = analytics?.latencyMs ?? 0;
  const sessionMsgs = analytics?.messagesInSession ?? 0;
  const memoryCount = analytics?.memoryCount ?? 0;

  return (
    <div className={cn('flex flex-col gap-3 p-4 h-full overflow-y-auto custom-scrollbar', className)}>
      {/* Mode badge */}
      <motion.div
        key={systemMode}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
        style={{ background: meta.bg, borderColor: meta.border }}
      >
        <ModeIcon className="w-4 h-4" style={{ color: meta.color }} />
        <div>
          <div className="text-[11px] font-bold" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="text-[9px] text-white/30 font-mono">current ai mode</div>
        </div>
        <motion.div
          className="ml-auto w-1.5 h-1.5 rounded-full"
          style={{ background: meta.color }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>

      {/* Confidence + retrieval gauges */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col items-center gap-1 bg-white/3 border border-white/8 rounded-xl py-3">
          <MiniGauge value={confidence} color="#22d3ee" />
          <span className="text-[9px] text-white/35 font-mono">CONFIDENCE</span>
          <span className="text-[11px] font-mono text-cyan-300">{(confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 bg-white/3 border border-white/8 rounded-xl py-3">
          <MiniGauge
            value={citationCount > 0 ? Math.min(citationCount / 8, 1) : 0}
            color="#8b5cf6"
          />
          <span className="text-[9px] text-white/35 font-mono">CITATIONS</span>
          <span className="text-[11px] font-mono text-violet-300">{citationCount}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2">
        <StatRow
          icon={Zap}
          label="Latency"
          value={latencyMs > 0 ? `${(latencyMs / 1000).toFixed(1)}s` : '—'}
          color="#f59e0b"
        />
        <StatRow
          icon={BrainCircuit}
          label="Session"
          value={`${sessionMsgs} msg${sessionMsgs !== 1 ? 's' : ''}`}
          color="#22d3ee"
        />
        <StatRow
          icon={MemoryStick}
          label="Memory"
          value={`${memoryCount} stored`}
          color="#8b5cf6"
        />
      </div>

      {/* Model info */}
      <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2">
        <StatRow
          icon={Cpu}
          label="Embedder"
          value="MiniLM-L6"
          color="#22d3ee"
        />
        <StatRow
          icon={Database}
          label="Vector DB"
          value={supabaseConnected ? 'pgvector' : 'offline'}
          color={supabaseConnected ? '#22d3ee' : '#f59e0b'}
        />
        <StatRow
          icon={BrainCircuit}
          label="LLM"
          value={
            systemMode === 'local-webllm'
              ? AIVORA_CONFIG.localLLM.defaultModel.split('-')[0] ?? 'Phi'
              : systemMode === 'rag'
              ? 'server'
              : 'none'
          }
          color={systemMode === 'local-webllm' ? '#8b5cf6' : '#22d3ee'}
        />
      </div>

      {/* Privacy indicators */}
      <div>
        <div className="text-[9px] text-white/25 uppercase tracking-widest font-mono mb-2">
          Privacy
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <PrivacyBadge icon={Shield} label="Local Embeddings" active />
          <PrivacyBadge icon={BrainCircuit} label="Browser LLM" active={webllmReady} />
          <PrivacyBadge icon={Database} label="Supabase Vector DB" active={supabaseConnected} />
          <PrivacyBadge icon={Shield} label="No External LLM API" active={systemMode !== 'rag'} />
        </div>
      </div>
    </div>
  );
}
