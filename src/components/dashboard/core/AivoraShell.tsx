'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  Activity,
  Cpu,
  Database,
  Shield,
  BrainCircuit,
  Command,
  Network,
  BarChart3,
  FileSearch,
  Trash2,
  Upload,
  HeartPulse,
  Zap,
  HardDrive,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { HolographicCore } from './HolographicCore';
import { AgentChat } from '@/components/dashboard/chat/AgentChat';
import { ReasoningTimeline } from '@/components/dashboard/chat/ReasoningTimeline';
import { SourceCitationPanel } from '@/components/dashboard/panels/SourceCitationPanel';
import { SystemAnalyticsPanel } from '@/components/dashboard/panels/SystemAnalyticsPanel';
import { KnowledgeVaultPanel } from '@/components/dashboard/panels/KnowledgeVaultPanel';
import { StudioPanel } from '@/components/dashboard/panels/StudioPanel';
import { CommandPalette, type PaletteCommand } from '@/components/dashboard/command/CommandPalette';
import { cn } from '@/lib/utils/cn';
import type { AgentPhase, ReasoningTrace, SystemMode, AgentAnalytics } from '@/lib/types/agent';
import type { SourceCitation } from '@/lib/types/citation';
import { AIVORA_CONFIG } from '@/config/aivora';
import { clearLocalMemory } from '@/lib/ai/memory/local-memory';
import { isWebGPUSupported } from '@/lib/ai/local-llm/webllm-client';

// Dynamic imports for heavy components — only loaded client-side
const HolographicCore3D = dynamic(
  () => import('./HolographicCore3D').then((m) => m.HolographicCore3D),
  { ssr: false, loading: () => <HolographicCore phase="idle" /> }
);

const AgentGraph = dynamic(
  () => import('@/components/dashboard/agent-graph/AgentGraph').then((m) => m.AgentGraph),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-white/20 text-xs font-mono">Loading graph…</div> }
);

type RightTab = 'citations' | 'analytics' | 'graph' | 'vault' | 'studio';

type RightTabButtonProps = {
  tab: RightTab;
  icon: typeof BarChart3;
  label: string;
  activeTab: RightTab;
  onSelect: (tab: RightTab) => void;
};

function RightTabButton({ tab, icon: Icon, label, activeTab, onSelect }: RightTabButtonProps) {
  return (
    <button
      onClick={() => onSelect(tab)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all',
        activeTab === tab
          ? 'bg-cyan-400/12 border border-cyan-400/20 text-cyan-300'
          : 'text-white/30 hover:text-white/60 hover:bg-white/4'
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function StatusDot({ active = true, label }: { active?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-emerald-400' : 'bg-slate-600')}
        animate={active ? { opacity: [1, 0.4, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">{label}</span>
    </div>
  );
}

const MODE_COLORS: Record<SystemMode, string> = {
  rag: '#22d3ee',
  'local-webllm': '#8b5cf6',
  demo: '#f59e0b',
  'error-safe': '#ef4444',
};
const MODE_LABELS: Record<SystemMode, string> = {
  rag: 'RAG',
  'local-webllm': 'Local WebLLM',
  demo: 'Aivora OS Lite',
  'error-safe': 'Error-Safe',
};

export function AivoraShell() {
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [citations, setCitations] = useState<SourceCitation[]>([]);
  const [trace, setTrace] = useState<ReasoningTrace | undefined>();
  // Start as 'local-webllm' when Supabase is configured (no server LLM needed).
  // Falls back to 'demo' when Supabase env vars are absent.
  const [systemMode, setSystemMode] = useState<SystemMode>(() => {
    const hasSupabase = !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    return hasSupabase ? 'local-webllm' : 'demo';
  });
  const [analytics, setAnalytics] = useState<AgentAnalytics | undefined>();
  const [rightTab, setRightTab] = useState<RightTab>('citations');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [webgpuAvailable, setWebgpuAvailable] = useState(false);
  const [webllmReady, setWebllmReady] = useState(false);
  const [vaultAction, setVaultAction] = useState<{ query: string; documentId?: string; documentIds?: string[] } | null>(null);
  const [docCount, setDocCount]       = useState<number | null>(null);
  const [healthOk, setHealthOk]       = useState<boolean | null>(null);

  const supabaseConnected = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const isActive = phase !== 'idle' && phase !== 'error';

  // Detect WebGPU after mount — keeps server render stable (false) to prevent hydration mismatch.
  useEffect(() => {
    void Promise.resolve(isWebGPUSupported()).then(setWebgpuAvailable);
  }, []);

  // Fetch system health + doc count once on mount (non-critical — failures are silently swallowed).
  useEffect(() => {
    async function fetchSystemStatus() {
      try {
        const [healthRes, docsRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/documents'),
        ]);
        const healthData = (await healthRes.json()) as { status?: string };
        setHealthOk(healthData.status === 'healthy');
        if (docsRes.ok) {
          const docsData = (await docsRes.json()) as { ok?: boolean; documents?: unknown[] };
          setDocCount(docsData.documents?.length ?? 0);
        }
      } catch {
        // Health is non-critical — no toast
      }
    }
    void fetchSystemStatus();
  }, []);

  // Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health');
      const data = await r.json() as { status: string; services: Record<string, unknown> };
      toast.success(`System healthy — ${JSON.stringify(data.status)}`);
    } catch {
      toast.error('Health check failed');
    }
  }, []);

  const paletteCommands: PaletteCommand[] = [
    {
      id: 'focus-chat',
      label: 'Ask Aivora',
      description: 'Focus the chat input and ask a question',
      icon: Cpu,
      shortcut: 'A',
      action: () => {
        document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      },
    },
    {
      id: 'view-citations',
      label: 'View Citations',
      description: 'Switch to the citations panel',
      icon: FileSearch,
      action: () => setRightTab('citations'),
    },
    {
      id: 'view-analytics',
      label: 'View Analytics',
      description: 'Switch to the system analytics panel',
      icon: BarChart3,
      action: () => setRightTab('analytics'),
    },
    {
      id: 'view-graph',
      label: 'Toggle Agent Graph',
      description: 'Switch to the neural reasoning graph view',
      icon: Network,
      action: () => setRightTab('graph'),
    },
    {
      id: 'clear-memory',
      label: 'Clear Local Memory',
      description: 'Erase all locally stored conversations from IndexedDB',
      icon: Trash2,
      action: async () => {
        await clearLocalMemory();
        toast.success('Local memory cleared.');
      },
    },
    {
      id: 'health',
      label: 'Check System Health',
      description: 'Ping /api/health to verify backend status',
      icon: HeartPulse,
      action: checkHealth,
    },
    {
      id: 'upload',
      label: 'Open Knowledge Vault',
      description: 'Switch to the Vault tab to upload and index documents',
      icon: Upload,
      action: () => setRightTab('vault'),
    },
    {
      id: 'studio',
      label: 'Open Tools Studio',
      description: 'Switch to the Studio tab — run workflows like Study Pack, Blog Post, Video Script',
      icon: Wand2,
      action: () => setRightTab('studio'),
    },
    {
      id: 'webllm',
      label: 'Switch to Local WebLLM',
      description: webgpuAvailable ? 'WebGPU detected — click Enable Local AI in the chat header' : 'WebGPU not available in this browser',
      icon: Zap,
      action: () => {
        if (!webgpuAvailable) {
          toast.warning('WebGPU not supported. Try Chrome 113+ on a GPU-enabled device.');
        } else if (webllmReady) {
          toast.info('Local AI is already loaded and ready.');
        } else {
          toast.info('Click "Enable Local AI" in the chat header to load Phi-3.5-mini in your browser.');
        }
      },
    },
  ];

  return (
    <div className="relative flex flex-col h-screen w-full overflow-hidden" style={{ background: '#020617' }}>
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,211,238,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 60% 40% at 80% 110%, rgba(139,92,246,0.05) 0%, transparent 60%)
          `,
        }}
      />

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center gap-4 px-5 py-2.5 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400/25 to-violet-500/25 border border-cyan-400/20 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-cyan-300" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-bold bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
              {AIVORA_CONFIG.product.name}
            </h1>
            <span className="text-[9px] text-white/20 font-mono">v{AIVORA_CONFIG.product.version}</span>
          </div>
        </div>

        {/* Mode badge */}
        <motion.div
          key={systemMode}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono"
          style={{
            borderColor: `${MODE_COLORS[systemMode]}35`,
            background: `${MODE_COLORS[systemMode]}0d`,
            color: MODE_COLORS[systemMode],
          }}
        >
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: MODE_COLORS[systemMode] }}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          {MODE_LABELS[systemMode]}
        </motion.div>

        {/* Privacy indicators */}
        <div className="hidden xl:flex items-center gap-2 ml-2">
          {[
            { icon: Shield, label: 'Local Embeddings', active: true },
            { icon: BrainCircuit, label: 'Browser LLM', active: webgpuAvailable },
            { icon: Database, label: 'Supabase', active: supabaseConnected },
            { icon: Shield, label: 'No Ext. API', active: systemMode !== 'rag' },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border',
                active
                  ? 'bg-emerald-400/8 border-emerald-400/20 text-emerald-300/70'
                  : 'bg-white/3 border-white/8 text-white/25'
              )}
            >
              <Icon className="w-2 h-2" />
              {label}
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3">
            <StatusDot label="Embedder" active />
            <StatusDot label={supabaseConnected ? 'Vector DB' : 'Local Only'} active={supabaseConnected} />
            <StatusDot label={isActive ? 'Reasoning' : 'Ready'} active={isActive} />
          </div>
          <div className="flex items-center gap-1.5 text-white/20 text-[10px] font-mono">
            <Activity className="w-3 h-3" />
            <span>AIVORA OS</span>
          </div>
          {/* Ctrl+K trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/8 text-white/35 hover:text-white/70 hover:bg-white/8 transition-all text-[10px] font-mono"
          >
            <Command className="w-3 h-3" />
            <span className="hidden sm:inline">Ctrl+K</span>
          </button>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-1 overflow-hidden gap-3 p-3">
        {/* Left — Chat (always visible) */}
        <AgentChat
          onPhaseChange={setPhase}
          onCitationsChange={setCitations}
          onTraceChange={setTrace}
          onModeChange={setSystemMode}
          onAnalyticsChange={setAnalytics}
          onLocalAIReady={() => setWebllmReady(true)}
          externalQuery={vaultAction}
          onExternalQueryConsumed={() => setVaultAction(null)}
          className="flex-1 min-w-0"
        />

        {/* Center — 3D Holographic + stats (hidden on small screens) */}
        <div className="hidden lg:flex flex-col items-center justify-start gap-3 w-72 flex-shrink-0 pt-2">
          <HolographicCore3D phase={phase} systemMode={systemMode} />

          {/* Mini stat cards */}
          <div className="w-full space-y-1.5">
            {[
              { icon: Cpu, label: 'Embedder', value: 'MiniLM-L6', color: '#22d3ee' },
              {
                icon: Database,
                label: 'Vector DB',
                value: supabaseConnected ? 'pgvector' : 'offline',
                color: supabaseConnected ? '#22d3ee' : '#f59e0b',
              },
              {
                icon: BrainCircuit,
                label: 'Mode',
                value: MODE_LABELS[systemMode],
                color: MODE_COLORS[systemMode],
              },
            ].map(({ icon: Icon, label, value, color }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 border border-white/8"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3 h-3" style={{ color }} />
                  <span className="text-[10px] text-white/30 uppercase tracking-wider font-mono">{label}</span>
                </div>
                <span className="text-[10px] font-mono font-semibold" style={{ color }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* System health summary */}
          <div className="w-full rounded-xl bg-white/[0.02] border border-white/6 px-3 py-3">
            <p className="text-[9px] font-mono uppercase tracking-widest text-white/20 mb-2.5">
              System Health
            </p>
            <div className="space-y-1.5">
              {([
                { label: 'Supabase',      ok: supabaseConnected,  hint: supabaseConnected ? 'connected' : 'missing env' },
                { label: 'pgvector',      ok: supabaseConnected,  hint: supabaseConnected ? 'ready' : 'unavailable'    },
                { label: 'Local Embedder',ok: true,               hint: 'MiniLM-L6-v2'                                  },
                { label: 'Browser LLM',  ok: webgpuAvailable,    hint: webgpuAvailable ? 'WebGPU ready' : 'no WebGPU' },
                { label: 'API health',   ok: healthOk ?? false,  hint: healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'degraded' },
              ] as const).map(({ label, ok, hint }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <motion.div
                      className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ok ? 'bg-emerald-400' : 'bg-amber-400')}
                      animate={ok ? { opacity: [1, 0.4, 1] } : {}}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    />
                    <span className="text-[9px] font-mono text-white/35 truncate">{label}</span>
                  </div>
                  <span className={cn('text-[9px] font-mono flex-shrink-0', ok ? 'text-emerald-400/70' : 'text-amber-400/70')}>
                    {hint}
                  </span>
                </div>
              ))}
              {/* Doc count */}
              <div className="flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-2.5 h-2.5 text-cyan-400/50 flex-shrink-0" />
                  <span className="text-[9px] font-mono text-white/35">Docs indexed</span>
                </div>
                <span className="text-[9px] font-mono text-cyan-300">
                  {docCount === null ? '—' : docCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Tabbed panel (Citations | Analytics | Graph) */}
        <div className="hidden xl:flex flex-col w-80 flex-shrink-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-2 flex-shrink-0 flex-wrap">
            <RightTabButton tab="citations" icon={FileSearch} label="Sources" activeTab={rightTab} onSelect={setRightTab} />
            <RightTabButton tab="analytics" icon={BarChart3} label="Analytics" activeTab={rightTab} onSelect={setRightTab} />
            <RightTabButton tab="graph" icon={Network} label="Graph" activeTab={rightTab} onSelect={setRightTab} />
            <RightTabButton tab="vault" icon={HardDrive} label="Vault" activeTab={rightTab} onSelect={setRightTab} />
            <RightTabButton tab="studio" icon={Wand2} label="Studio" activeTab={rightTab} onSelect={setRightTab} />
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden rounded-3xl border border-white/8 bg-slate-950/40 backdrop-blur-2xl">
            {rightTab === 'citations' && (
              <SourceCitationPanel citations={citations} className="h-full border-0 rounded-3xl" />
            )}
            {rightTab === 'analytics' && (
              <SystemAnalyticsPanel
                systemMode={systemMode}
                analytics={analytics}
                supabaseConnected={supabaseConnected}
                webllmReady={webllmReady}
                className="h-full"
              />
            )}
            {rightTab === 'graph' && (
              <AgentGraph phase={phase} systemMode={systemMode} citations={citations} className="h-full" />
            )}
            {rightTab === 'vault' && (
              <KnowledgeVaultPanel
                className="h-full"
                onAction={(query, documentId) => setVaultAction({ query, documentId })}
                onMultiAction={(query, documentIds) => {
                  setVaultAction({ query, documentIds });
                  setRightTab('citations');
                }}
              />
            )}
            {rightTab === 'studio' && (
              <StudioPanel
                className="h-full"
                onMultiAction={(query, documentIds) => {
                  setVaultAction({ query, documentIds });
                  setRightTab('citations');
                }}
              />
            )}
          </div>
        </div>
      </main>

      {/* ── Reasoning timeline ───────────────────────────────────────────────── */}
      <footer className="relative z-10 px-4 py-2 border-t border-white/5 bg-slate-950/70 backdrop-blur-xl flex-shrink-0">
        <ReasoningTimeline currentPhase={phase} trace={trace} />
      </footer>

      {/* ── Command palette overlay ──────────────────────────────────────────── */}
      <CommandPalette
        commands={paletteCommands}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
